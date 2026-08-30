import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { CLAIM_QUESTION_ANSWER_SQL, RUNTIME_INTEGRITY_SCHEMA } from "../db/runtime-integrity";

function fixture(options: { installIntegrity?: boolean } = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE people (id TEXT PRIMARY KEY, photo_attachment_id TEXT);
    CREATE TABLE relationships (
      id TEXT PRIMARY KEY, from_person_id TEXT NOT NULL, to_person_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('parent', 'spouse'))
    );
    CREATE UNIQUE INDEX idx_relationship_unique ON relationships(from_person_id, to_person_id, type);
    CREATE TABLE stories (id TEXT PRIMARY KEY);
    CREATE TABLE story_people (story_id TEXT NOT NULL, person_id TEXT NOT NULL);
    CREATE TABLE attachments (id TEXT PRIMARY KEY, object_key TEXT NOT NULL);
    CREATE TABLE story_attachments (story_id TEXT NOT NULL, attachment_id TEXT NOT NULL);
    CREATE TABLE person_photos (person_id TEXT NOT NULL, attachment_id TEXT NOT NULL);
    CREATE TABLE person_comments (id TEXT PRIMARY KEY, person_id TEXT NOT NULL);
    CREATE TABLE members (email TEXT PRIMARY KEY, person_id TEXT);
    CREATE TABLE document_queue (id TEXT PRIMARY KEY, attachment_id TEXT NOT NULL);
    CREATE TABLE open_questions (id TEXT PRIMARY KEY, proposal_json TEXT, status TEXT NOT NULL);
    CREATE TABLE object_deletion_queue (object_key TEXT PRIMARY KEY, queued_at TEXT NOT NULL);

    INSERT INTO attachments VALUES ('photo', 'evidence/photo'), ('document', 'evidence/document');
    INSERT INTO people(id) VALUES ('a'), ('b'), ('c'), ('d'), ('e'), ('f');
    INSERT INTO stories VALUES ('story');
    INSERT INTO open_questions VALUES ('question-1', NULL, 'open'), ('question-2', NULL, 'open');
  `);
  if (options.installIntegrity !== false) database.exec(RUNTIME_INTEGRITY_SCHEMA.join(";\n"));
  return database;
}

function transaction(database: DatabaseSync, statements: Array<{ sql: string; values?: string[] }>) {
  database.exec("BEGIN");
  try {
    for (const { sql, values = [] } of statements) database.prepare(sql).run(...values);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

describe("database-enforced relationship invariants", () => {
  it("rejects missing endpoints, self-links, reverse spouses, third parents, and cycles", () => {
    const database = fixture();
    try {
      expect(() => database.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?)")
        .run("missing", "missing", "a", "parent")).toThrow(/relationship_person_missing/);
      expect(() => database.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?)")
        .run("self", "a", "a", "parent")).toThrow(/relationship_self_link/);

      database.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?)").run("spouse", "a", "b", "spouse");
      expect(() => database.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?)")
        .run("reverse", "b", "a", "spouse")).toThrow(/relationship_reverse_spouse/);

      database.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?)").run("parent-1", "a", "d", "parent");
      database.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?)").run("parent-2", "b", "d", "parent");
      expect(() => database.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?)")
        .run("parent-3", "c", "d", "parent")).toThrow(/relationship_too_many_parents/);

      database.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?)").run("edge-1", "c", "e", "parent");
      database.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?)").run("edge-2", "e", "f", "parent");
      expect(() => database.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?)")
        .run("cycle", "f", "c", "parent")).toThrow(/relationship_parent_cycle/);
      expect(() => database.prepare("UPDATE relationships SET from_person_id = ? WHERE id = ?")
        .run("missing", "edge-1")).toThrow(/relationship_person_missing/);
    } finally {
      database.close();
    }
  });

  it("installs without rejecting legacy rows, then protects future writes", () => {
    const database = fixture({ installIntegrity: false });
    try {
      database.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?)").run("legacy-self", "a", "a", "parent");
      database.prepare("INSERT INTO attachments VALUES (?, ?)").run("legacy-shared", "evidence/photo");
      expect(() => database.exec(RUNTIME_INTEGRITY_SCHEMA.join(";\n"))).not.toThrow();
      expect(database.prepare("SELECT COUNT(*) AS count FROM attachments WHERE object_key = 'evidence/photo'").get())
        .toEqual({ count: 2 });
      expect(() => database.prepare("INSERT INTO attachments VALUES (?, ?)").run("another", "evidence/photo"))
        .toThrow(/attachment_object_key_unavailable/);
    } finally {
      database.close();
    }
  });
});

describe("database-enforced live references", () => {
  it("rejects missing story, person, attachment, portrait, document, and question-image targets", () => {
    const database = fixture();
    try {
      expect(() => database.prepare("INSERT INTO story_people VALUES (?, ?)").run("missing", "a"))
        .toThrow(/story_person_story_missing/);
      expect(() => database.prepare("INSERT INTO story_people VALUES (?, ?)").run("story", "missing"))
        .toThrow(/story_person_person_missing/);
      expect(() => database.prepare("INSERT INTO story_attachments VALUES (?, ?)").run("story", "missing"))
        .toThrow(/story_attachment_attachment_missing/);
      expect(() => database.prepare("INSERT INTO person_photos VALUES (?, ?)").run("a", "missing"))
        .toThrow(/person_photo_attachment_missing/);
      expect(() => database.prepare("UPDATE people SET photo_attachment_id = ? WHERE id = ?").run("missing", "a"))
        .toThrow(/person_portrait_attachment_missing/);
      expect(() => database.prepare("INSERT INTO document_queue VALUES (?, ?)").run("queued", "missing"))
        .toThrow(/document_attachment_missing/);
      expect(() => database.prepare("INSERT INTO open_questions VALUES (?, ?, ?)")
        .run("image", '{"imageId":"missing"}', "open")).toThrow(/question_image_attachment_missing/);
      expect(() => database.prepare("INSERT INTO open_questions VALUES (?, ?, ?)")
        .run("legacy-json", "not-json", "open")).not.toThrow();
    } finally {
      database.close();
    }
  });

  it("prevents referenced parents from being deleted until their links are removed", () => {
    const database = fixture();
    try {
      database.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?)").run("parent", "a", "b", "parent");
      database.prepare("INSERT INTO story_people VALUES (?, ?)").run("story", "a");
      database.prepare("INSERT INTO story_attachments VALUES (?, ?)").run("story", "photo");
      expect(() => database.prepare("DELETE FROM people WHERE id = ?").run("a")).toThrow(/person_still_referenced/);
      expect(() => database.prepare("DELETE FROM stories WHERE id = ?").run("story")).toThrow(/story_still_referenced/);
      expect(() => database.prepare("DELETE FROM attachments WHERE id = ?").run("photo")).toThrow(/attachment_still_referenced/);

      database.prepare("DELETE FROM relationships WHERE id = 'parent'").run();
      database.prepare("DELETE FROM story_people WHERE person_id = 'a'").run();
      database.prepare("DELETE FROM story_attachments WHERE attachment_id = 'photo'").run();
      expect(() => database.prepare("DELETE FROM people WHERE id = ?").run("a")).not.toThrow();
      expect(() => database.prepare("DELETE FROM stories WHERE id = ?").run("story")).not.toThrow();
      expect(() => database.prepare("DELETE FROM attachments WHERE id = ?").run("photo")).not.toThrow();
    } finally {
      database.close();
    }
  });

  it("reserves queued object keys against reuse", () => {
    const database = fixture();
    try {
      database.prepare("INSERT INTO object_deletion_queue VALUES (?, ?)").run("evidence/deleted", "now");
      expect(() => database.prepare("INSERT INTO attachments VALUES (?, ?)").run("replacement", "evidence/deleted"))
        .toThrow(/attachment_object_key_unavailable/);
    } finally {
      database.close();
    }
  });
});

describe("atomic question answer claims", () => {
  it("allows only one competing answer batch to apply actions", () => {
    const database = fixture();
    try {
      transaction(database, [
        { sql: CLAIM_QUESTION_ANSWER_SQL, values: ["question-1", "first"] },
        { sql: "INSERT INTO people(id) VALUES (?)", values: ["first-spouse"] },
        { sql: "INSERT INTO relationships VALUES (?, ?, ?, 'spouse')", values: ["first-link", "a", "first-spouse"] },
        { sql: "UPDATE open_questions SET status = 'confirmed' WHERE id = ? AND status = 'open'", values: ["question-1"] },
      ]);
      expect(() => transaction(database, [
        { sql: CLAIM_QUESTION_ANSWER_SQL, values: ["question-1", "second"] },
        { sql: "INSERT INTO people(id) VALUES (?)", values: ["second-spouse"] },
        { sql: "INSERT INTO relationships VALUES (?, ?, ?, 'spouse')", values: ["second-link", "a", "second-spouse"] },
      ])).toThrow(/UNIQUE constraint failed/);
      expect(database.prepare("SELECT id FROM people WHERE id LIKE '%-spouse' ORDER BY id").all())
        .toEqual([{ id: "first-spouse" }]);
      expect(database.prepare("SELECT question_id, claimed_at FROM question_answer_claims").all())
        .toEqual([{ question_id: "question-1", claimed_at: "first" }]);
    } finally {
      database.close();
    }
  });

  it("rolls the claim back when a later action violates an invariant", () => {
    const database = fixture();
    try {
      expect(() => transaction(database, [
        { sql: CLAIM_QUESTION_ANSWER_SQL, values: ["question-2", "failed"] },
        { sql: "INSERT INTO relationships VALUES (?, ?, ?, 'parent')", values: ["bad-link", "missing", "a"] },
      ])).toThrow(/relationship_person_missing/);
      expect(database.prepare("SELECT * FROM question_answer_claims WHERE question_id = 'question-2'").all()).toEqual([]);
      expect(() => transaction(database, [
        { sql: CLAIM_QUESTION_ANSWER_SQL, values: ["question-2", "retry"] },
        { sql: "UPDATE open_questions SET status = 'denied' WHERE id = ?", values: ["question-2"] },
      ])).not.toThrow();
    } finally {
      database.close();
    }
  });
});
