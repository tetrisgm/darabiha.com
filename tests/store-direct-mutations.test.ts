import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const worker = vi.hoisted(() => ({
  env: {} as { DB?: unknown; FILES?: unknown },
  waitUntil: vi.fn(),
}));
vi.mock("cloudflare:workers", () => worker);

import {
  addComment,
  attachPersonPhoto,
  linkPersonPhoto,
  removeComment,
  removePersonPhoto,
  setPersonPortrait,
  unlinkPersonPhoto,
} from "../db/store";

type BindValue = string | number | null;

class SqliteD1Statement {
  constructor(
    private readonly database: DatabaseSync,
    readonly sql: string,
    private readonly values: BindValue[] = [],
  ) {}

  bind(...values: BindValue[]) {
    return new SqliteD1Statement(this.database, this.sql, values);
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }

  async all<T>() {
    return { success: true, results: this.database.prepare(this.sql).all(...this.values) as T[], meta: { changes: 0 } };
  }

  async first<T>(column?: string) {
    const row = this.database.prepare(this.sql).get(...this.values) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }
}

class SqliteD1 {
  beforeNextBatch: (() => void) | null = null;
  beforeMatchingBatch: ((statements: readonly SqliteD1Statement[]) => boolean) | null = null;

  constructor(readonly database: DatabaseSync) {}

  prepare(sql: string) {
    return new SqliteD1Statement(this.database, sql);
  }

  async batch(statements: SqliteD1Statement[]) {
    if (this.beforeMatchingBatch?.(statements)) this.beforeMatchingBatch = null;
    this.beforeNextBatch?.();
    this.beforeNextBatch = null;
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

let sqlite: DatabaseSync;
let d1: SqliteD1;
const files = {
  put: vi.fn(async () => undefined),
  get: vi.fn(async () => null),
  delete: vi.fn(async () => undefined),
};

function insertPerson(id: string) {
  sqlite.prepare(`INSERT INTO people (id, display_name, created_at, updated_at)
    VALUES (?, ?, 'now', 'now')`).run(id, id);
}

function insertAttachment(id: string) {
  sqlite.prepare(`INSERT INTO attachments
    (id, object_key, filename, content_type, size, created_by, created_at)
    VALUES (?, ?, ?, 'image/jpeg', 4, 'seed', 'now')`)
    .run(id, `evidence/${id}`, `${id}.jpg`);
}

function auditCount(kind: string, personId?: string): number {
  const row = personId
    ? sqlite.prepare(`SELECT COUNT(*) AS count FROM change_log
        WHERE kind = ? AND json_extract(payload_json, '$.personId') = ?`).get(kind, personId)
    : sqlite.prepare("SELECT COUNT(*) AS count FROM change_log WHERE kind = ?").get(kind);
  return Number((row as { count: number }).count);
}

beforeAll(() => {
  sqlite = new DatabaseSync(":memory:");
  d1 = new SqliteD1(sqlite);
  worker.env.DB = d1;
  worker.env.FILES = files;
});

afterAll(() => sqlite.close());

describe("direct photo mutation audit integrity", () => {
  it("validates before upload and does not audit missing or repeated portrait changes", async () => {
    files.put.mockClear();
    await expect(attachPersonPhoto("missing", new File(["photo"], "photo.jpg", { type: "image/jpeg" }), "editor@example.com"))
      .rejects.toThrow("That person is no longer in the tree.");
    expect(files.put).not.toHaveBeenCalled();

    insertPerson("portrait-person");
    insertAttachment("portrait-photo");
    await removePersonPhoto("portrait-person", "editor@example.com");
    expect(auditCount("remove_person_photo", "portrait-person")).toBe(0);

    await setPersonPortrait("portrait-person", "portrait-photo", "editor@example.com");
    await setPersonPortrait("portrait-person", "portrait-photo", "editor@example.com");
    expect(auditCount("set_person_portrait", "portrait-person")).toBe(1);

    await removePersonPhoto("portrait-person", "editor@example.com");
    await removePersonPhoto("portrait-person", "editor@example.com");
    expect(auditCount("remove_person_photo", "portrait-person")).toBe(1);
  });

  it("removes an unreferenced upload when the person disappears before linking", async () => {
    insertPerson("raced-upload-person");
    files.delete.mockClear();
    d1.beforeMatchingBatch = (statements) => {
      if (!statements.some(({ sql }) => sql.includes("INSERT OR IGNORE INTO person_photos"))) return false;
      sqlite.prepare("DELETE FROM people WHERE id = ?").run("raced-upload-person");
      return true;
    };
    await expect(attachPersonPhoto(
      "raced-upload-person",
      new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "raced-upload.jpg", { type: "image/jpeg" }),
      "editor@example.com",
    )).rejects.toThrow(/person_photo_person_missing/);
    expect(sqlite.prepare("SELECT id FROM attachments WHERE filename = 'raced-upload.jpg'").get()).toBeUndefined();
    expect(sqlite.prepare("SELECT * FROM object_deletion_queue").all()).toEqual([]);
    expect(auditCount("upload_attachment")).toBe(0);
    expect(files.delete).toHaveBeenCalledOnce();
  });

  it("keeps link and unlink retries idempotent, including a legacy portrait-only row", async () => {
    insertPerson("gallery-person");
    insertAttachment("gallery-photo");
    await linkPersonPhoto("gallery-person", "gallery-photo", "editor@example.com");
    await linkPersonPhoto("gallery-person", "gallery-photo", "editor@example.com");
    expect(auditCount("link_person_photo", "gallery-person")).toBe(1);

    await unlinkPersonPhoto("gallery-person", "gallery-photo", "editor@example.com");
    await unlinkPersonPhoto("gallery-person", "gallery-photo", "editor@example.com");
    expect(auditCount("unlink_person_photo", "gallery-person")).toBe(1);

    insertPerson("legacy-portrait-person");
    insertAttachment("legacy-portrait-photo");
    sqlite.prepare("UPDATE people SET photo_attachment_id = ? WHERE id = ?")
      .run("legacy-portrait-photo", "legacy-portrait-person");
    await unlinkPersonPhoto("legacy-portrait-person", "legacy-portrait-photo", "editor@example.com");
    expect(auditCount("unlink_person_photo", "legacy-portrait-person")).toBe(1);
    expect(sqlite.prepare("SELECT photo_attachment_id FROM people WHERE id = ?").get("legacy-portrait-person"))
      .toEqual({ photo_attachment_id: null });
  });
});

describe("direct comment target and audit integrity", () => {
  it("rejects a missing person before writing a comment or audit", async () => {
    const before = auditCount("add_comment");
    await expect(addComment("missing", "Hello", "reader@example.com", null))
      .rejects.toThrow("That person is no longer in the tree.");
    expect(auditCount("add_comment")).toBe(before);
  });

  it("does not audit a comment that disappears after the ownership read", async () => {
    insertPerson("comment-person");
    await addComment("comment-person", "Hello", "reader@example.com", null);
    const comment = sqlite.prepare("SELECT id FROM person_comments WHERE person_id = ?").get("comment-person") as { id: string };
    const before = auditCount("remove_comment");
    d1.beforeNextBatch = () => {
      sqlite.prepare("DELETE FROM person_comments WHERE id = ?").run(comment.id);
    };
    await expect(removeComment(comment.id, "reader@example.com", false)).rejects.toThrow("comment_not_found");
    expect(auditCount("remove_comment")).toBe(before);
  });
});
