/**
 * Every live database reference to an attachment, followed by a durable R2
 * deletion intent. D1 can commit this plan atomically; R2 cannot participate
 * in that transaction, so the queued object key is removed only after R2
 * confirms deletion. Retrying an R2 delete is safe and idempotent.
 *
 * change_log is deliberately absent: it is historical audit data, not a live
 * relation. Open questions keep their text and answers, but lose a live image
 * link that would otherwise point at the deleted attachment.
 */
export const ATTACHMENT_DELETION_QUERIES = [
  {
    sql: "UPDATE people SET photo_attachment_id = NULL, updated_at = ? WHERE photo_attachment_id = ?",
    values: ({ attachmentId, deletedAt }: AttachmentDeletionContext) => [deletedAt, attachmentId],
  },
  { sql: "DELETE FROM person_photos WHERE attachment_id = ?", values: ({ attachmentId }: AttachmentDeletionContext) => [attachmentId] },
  { sql: "DELETE FROM story_attachments WHERE attachment_id = ?", values: ({ attachmentId }: AttachmentDeletionContext) => [attachmentId] },
  { sql: "DELETE FROM document_queue WHERE attachment_id = ?", values: ({ attachmentId }: AttachmentDeletionContext) => [attachmentId] },
  {
    sql: `UPDATE open_questions SET proposal_json = json_remove(proposal_json, '$.imageId')
      WHERE status = 'open' AND proposal_json IS NOT NULL
        AND json_extract(CASE WHEN json_valid(proposal_json) THEN proposal_json END, '$.imageId') = ?`,
    values: ({ attachmentId }: AttachmentDeletionContext) => [attachmentId],
  },
  { sql: "DELETE FROM attachments WHERE id = ?", values: ({ attachmentId }: AttachmentDeletionContext) => [attachmentId] },
  {
    // Legacy databases may contain two metadata rows for one object key. The
    // physical object survives until the last metadata row is removed.
    sql: `INSERT OR IGNORE INTO object_deletion_queue (object_key, queued_at)
      SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM attachments WHERE object_key = ?)`,
    values: ({ objectKey, deletedAt }: AttachmentDeletionContext) => [objectKey, deletedAt, objectKey],
  },
] as const;

export type AttachmentDeletionContext = { attachmentId: string; objectKey: string; deletedAt: string };
type BindableStatement<T> = { bind(...values: string[]): T };
type StatementDatabase<T> = { prepare(sql: string): BindableStatement<T> };

export function prepareAttachmentDeletion<T>(database: StatementDatabase<T>, context: AttachmentDeletionContext): T[] {
  return ATTACHMENT_DELETION_QUERIES.map(({ sql, values }) => database.prepare(sql).bind(...values(context)));
}

type ObjectDeletionDependencies = {
  deleteObject: (objectKey: string) => Promise<void>;
  clearQueuedObject: (objectKey: string) => Promise<void>;
};

/** The queue row survives either failure, so the whole operation can be
 * retried without reconstructing metadata or relational links. */
export async function finalizeQueuedObjectDeletion(
  objectKey: string,
  dependencies: ObjectDeletionDependencies,
): Promise<void> {
  await dependencies.deleteObject(objectKey);
  await dependencies.clearQueuedObject(objectKey);
}
