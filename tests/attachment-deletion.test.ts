import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { finalizeQueuedObjectDeletion, prepareAttachmentDeletion } from "../db/attachment-deletion";

function fixture() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE people (id TEXT PRIMARY KEY, photo_attachment_id TEXT, updated_at TEXT NOT NULL);
    CREATE TABLE attachments (id TEXT PRIMARY KEY, object_key TEXT NOT NULL);
    CREATE TABLE stories (id TEXT PRIMARY KEY);
    CREATE TABLE story_attachments (story_id TEXT NOT NULL, attachment_id TEXT NOT NULL);
    CREATE TABLE person_photos (person_id TEXT NOT NULL, attachment_id TEXT NOT NULL);
    CREATE TABLE document_queue (id TEXT PRIMARY KEY, attachment_id TEXT NOT NULL);
    CREATE TABLE open_questions (id TEXT PRIMARY KEY, proposal_json TEXT, status TEXT NOT NULL);
    CREATE TABLE object_deletion_queue (object_key TEXT PRIMARY KEY, queued_at TEXT NOT NULL);

    INSERT INTO attachments VALUES ('deleted-photo', 'evidence/deleted-photo'), ('kept-photo', 'evidence/kept-photo');
    INSERT INTO people VALUES ('portrait-owner', 'deleted-photo', 'earlier'), ('other-person', 'kept-photo', 'earlier');
    INSERT INTO stories VALUES ('story-1');
    INSERT INTO story_attachments VALUES ('story-1', 'deleted-photo'), ('story-1', 'kept-photo');
    INSERT INTO person_photos VALUES ('portrait-owner', 'deleted-photo'), ('other-person', 'deleted-photo'), ('other-person', 'kept-photo');
    INSERT INTO document_queue VALUES ('deleted-document', 'deleted-photo'), ('kept-document', 'kept-photo');
    INSERT INTO open_questions VALUES
      ('active-image', '{"imageId":"deleted-photo","choices":[]}', 'open'),
      ('active-other-image', '{"imageId":"kept-photo"}', 'open'),
      ('historical-image', '{"imageId":"deleted-photo"}', 'confirmed'),
      ('legacy-invalid-json', 'not-json', 'open');
  `);
  return database;
}

function deleteAttachment(database: DatabaseSync) {
  database.exec("BEGIN");
  try {
    const statements = prepareAttachmentDeletion({
      prepare(sql: string) {
        return {
          bind(...values: string[]) {
            return () => database.prepare(sql).run(...values);
          },
        };
      },
    }, {
      attachmentId: "deleted-photo",
      objectKey: "evidence/deleted-photo",
      deletedAt: "2026-08-30T12:00:00.000Z",
    });
    for (const run of statements) run();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

describe("complete attachment deletion", () => {
  it("atomically removes every live reference and queues the R2 object", () => {
    const database = fixture();
    try {
      deleteAttachment(database);

      expect(database.prepare("SELECT * FROM attachments").all()).toEqual([
        { id: "kept-photo", object_key: "evidence/kept-photo" },
      ]);
      expect(database.prepare("SELECT * FROM people ORDER BY id").all()).toEqual([
        { id: "other-person", photo_attachment_id: "kept-photo", updated_at: "earlier" },
        { id: "portrait-owner", photo_attachment_id: null, updated_at: "2026-08-30T12:00:00.000Z" },
      ]);
      expect(database.prepare("SELECT * FROM person_photos").all()).toEqual([
        { person_id: "other-person", attachment_id: "kept-photo" },
      ]);
      expect(database.prepare("SELECT * FROM story_attachments").all()).toEqual([
        { story_id: "story-1", attachment_id: "kept-photo" },
      ]);
      expect(database.prepare("SELECT * FROM document_queue").all()).toEqual([
        { id: "kept-document", attachment_id: "kept-photo" },
      ]);
      expect(database.prepare("SELECT id, proposal_json FROM open_questions ORDER BY id").all()).toEqual([
        { id: "active-image", proposal_json: '{"choices":[]}' },
        { id: "active-other-image", proposal_json: '{"imageId":"kept-photo"}' },
        { id: "historical-image", proposal_json: '{"imageId":"deleted-photo"}' },
        { id: "legacy-invalid-json", proposal_json: "not-json" },
      ]);
      expect(database.prepare("SELECT * FROM object_deletion_queue").all()).toEqual([
        { object_key: "evidence/deleted-photo", queued_at: "2026-08-30T12:00:00.000Z" },
      ]);
    } finally {
      database.close();
    }
  });

  it("does not queue a shared legacy object until its last metadata row is deleted", () => {
    const database = fixture();
    try {
      database.prepare("INSERT INTO attachments VALUES (?, ?)").run("shared-metadata", "evidence/deleted-photo");
      deleteAttachment(database);
      expect(database.prepare("SELECT id FROM attachments WHERE object_key = ?").all("evidence/deleted-photo"))
        .toEqual([{ id: "shared-metadata" }]);
      expect(database.prepare("SELECT * FROM object_deletion_queue").all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});

describe("queued R2 deletion", () => {
  it("clears the durable intent only after R2 confirms deletion", async () => {
    const order: string[] = [];
    await finalizeQueuedObjectDeletion("evidence/photo", {
      deleteObject: vi.fn(async (key) => { order.push(`r2:${key}`); }),
      clearQueuedObject: vi.fn(async (key) => { order.push(`d1:${key}`); }),
    });
    expect(order).toEqual(["r2:evidence/photo", "d1:evidence/photo"]);
  });

  it("retains the durable intent when R2 deletion fails", async () => {
    const clearQueuedObject = vi.fn(async () => undefined);
    await expect(finalizeQueuedObjectDeletion("evidence/photo", {
      deleteObject: vi.fn(async () => { throw new Error("R2 unavailable"); }),
      clearQueuedObject,
    })).rejects.toThrow("R2 unavailable");
    expect(clearQueuedObject).not.toHaveBeenCalled();
  });

  it("retains a retryable intent when clearing it fails after R2 deletion", async () => {
    const deleteObject = vi.fn(async () => undefined);
    await expect(finalizeQueuedObjectDeletion("evidence/photo", {
      deleteObject,
      clearQueuedObject: vi.fn(async () => { throw new Error("D1 unavailable"); }),
    })).rejects.toThrow("D1 unavailable");
    expect(deleteObject).toHaveBeenCalledWith("evidence/photo");
  });
});
