import { listChangeLog } from "../../db/store";
import { requireEditor } from "../authz";

export const dynamic = "force-dynamic";
export const metadata = { title: "History · Darabiha" };

const KIND_LABELS: Record<string, string> = {
  add_person: "Added a person", update_person: "Updated a record", delete_person: "Removed a person",
  add_relationship: "Linked two people", delete_relationship: "Removed a link", relationship_status: "Marriage status",
  add_story: "Added a story", update_story: "Updated a story", delete_story: "Removed a story",
  attach_person_photo: "Added a photograph", remove_person_photo: "Removed a portrait",
  set_person_portrait: "Chose a portrait", link_person_photo: "Added someone to a photograph", unlink_person_photo: "Unlinked a photograph",
  upload_attachment: "Uploaded evidence", add_comment: "Left a note", remove_comment: "Removed a note",
  answer_question: "Answered a question", set_member: "Member change", remove_member: "Member removed",
  set_visibility: "Site access", link_identity: "Linked a sign-in", unlink_identity: "Unlinked a sign-in",
};

export default async function HistoryPage() {
  const auth = await requireEditor();
  if (!auth.ok) {
    return (
      <main className="settings-page">
        <header className="settings-masthead">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load; client-side Link navigation is unreliable here */}
          <a className="settings-back-pill" href="/">← Back to the family tree</a>
        </header>
        <section className="settings-panel"><h1>History</h1>
          <div className="settings-card"><p>The record of changes is kept for family editors. Sign in from the <a href="/settings">settings page</a>.</p></div>
        </section>
      </main>
    );
  }
  const { entries } = await listChangeLog();
  return (
    <main className="settings-page">
      <header className="settings-masthead">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load; client-side Link navigation is unreliable here */}
        <a className="settings-back-pill" href="/">← Back to the family tree</a>
      </header>
      <section className="settings-panel">
        <h1>History</h1>
        <div className="settings-card">
          <p className="settings-hint">Every change anyone has made to the archive, newest first. Nothing here is editable — it is the record of the record.</p>
          <ol className="history-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <div className="history-line">
                  <span className="history-kind">{KIND_LABELS[entry.kind] ?? entry.kind.replace(/_/g, " ")}</span>
                  <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                </div>
                <p className="history-summary">{entry.summary}</p>
                <p className="history-actor">{entry.actorEmail}</p>
              </li>
            ))}
          </ol>
          {!entries.length && <p>Nothing has been changed yet.</p>}
        </div>
      </section>
    </main>
  );
}
