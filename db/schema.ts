import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  givenName: text("given_name"), familyName: text("family_name"),
  birthDate: text("birth_date"), deathDate: text("death_date"),
  birthPlace: text("birth_place"), deathPlace: text("death_place"), biography: text("biography"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});
export const relationships = sqliteTable("relationships", {
  id: text("id").primaryKey(), fromPersonId: text("from_person_id").notNull(),
  toPersonId: text("to_person_id").notNull(), type: text("type", { enum: ["parent", "spouse"] }).notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("idx_relationship_unique").on(table.fromPersonId, table.toPersonId, table.type)]);
export const stories = sqliteTable("stories", {
  id: text("id").primaryKey(), title: text("title").notNull(), body: text("body").notNull(),
  date: text("date"), place: text("place"), createdAt: text("created_at").notNull(),
});
export const storyPeople = sqliteTable("story_people", { storyId: text("story_id").notNull(), personId: text("person_id").notNull() },
  (table) => [uniqueIndex("idx_story_people_unique").on(table.storyId, table.personId)]);
export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(), objectKey: text("object_key").notNull(), filename: text("filename").notNull(),
  contentType: text("content_type").notNull(), size: integer("size").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(),
});
export const storyAttachments = sqliteTable("story_attachments", { storyId: text("story_id").notNull(), attachmentId: text("attachment_id").notNull() },
  (table) => [uniqueIndex("idx_story_attachments_unique").on(table.storyId, table.attachmentId)]);
export const changeLog = sqliteTable("change_log", {
  id: text("id").primaryKey(), actorEmail: text("actor_email").notNull(), kind: text("kind").notNull(),
  summary: text("summary").notNull(), payloadJson: text("payload_json").notNull(), createdAt: text("created_at").notNull(),
});
