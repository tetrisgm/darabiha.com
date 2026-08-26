"use client";

import { useRef, useState } from "react";
import type { AgentConflict, ChangeProposal, FamilyTree, Person } from "../../lib/types";
import { relatedPeople } from "../../lib/relationships";
import { TimelineView, WorldMapView } from "./ArchiveViews";
import { FamilyTreeCanvas } from "./FamilyTreeCanvas";
import { BUILD_ID, VERSION } from "../../lib/build";

type Props = {
  initialTree: FamilyTree;
  viewer: { signedIn: boolean; canEdit: boolean; displayName: string | null };
  signInPath: string;
  signOutPath: string;
  signInEnabled: boolean;
};

type ChatMessage = { role: "user" | "assistant"; text: string };
type PendingProposal = { id: string; proposal: ChangeProposal; state: "pending" | "applying" | "applied" | "error"; appliedPersonId?: string };

function proposalRank(proposal: ChangeProposal) {
  if (proposal.kind === "add_person") return 0;
  if (proposal.kind === "update_person") return 1;
  if (proposal.kind === "add_relationship") return 2;
  if (proposal.kind === "add_story" || proposal.kind === "update_story") return 3;
  return 4;
}


function lifeLine(person: Person) {
  if (!person.birthDate && !person.deathDate) return "Dates not recorded";
  return `${formatDate(person.birthDate) ?? "?"} – ${formatDate(person.deathDate) ?? "present"}`;
}
function formatDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}
function locationLine(city: string | null, country: string | null, fallback: string | null) { return city || country ? [city, country].filter(Boolean).join(", ") : fallback; }

export default function FamilyTreeApp({ initialTree, viewer, signInPath, signOutPath, signInEnabled }: Props) {
  const [tree, setTree] = useState(initialTree);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [, setProposals] = useState<PendingProposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [addingPerson, setAddingPerson] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "timeline" | "map">("tree");
  const [authError] = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("auth_error") : null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function sendMessage() {
    const text = input.trim();
    if ((!text && !files.length) || busy) return;
    const nextMessages = [...messages, { role: "user" as const, text: text || `Attached ${files.map((file) => file.name).join(", ")}` }];
    setMessages(nextMessages);
    setInput(""); setError(""); setBusy(true);
    const form = new FormData();
    form.set("message", text);
    form.set("history", JSON.stringify(messages.slice(-6)));
    form.set("file_manifest", JSON.stringify(files.map((file) => ({ name: file.name, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, size: file.size, type: file.type }))));
    files.forEach((file) => form.append("files", file));
    try {
      const response = await fetch("/api/agent", { method: "POST", body: form });
      const data = await response.json() as { reply?: string; proposals?: ChangeProposal[]; conflicts?: AgentConflict[]; error?: string };
      if (!response.ok) throw new Error(data.error || "request_failed");
      let latestTree = tree;
      let appliedCount = 0;
      const failures: string[] = [];
      if (data.proposals?.length) {
        const imported = [...data.proposals].sort((left, right) => proposalRank(left) - proposalRank(right)).map((proposal) => ({ id: crypto.randomUUID(), proposal, state: "pending" as const }));
        setProposals((current) => [...current, ...imported]);
        for (const item of imported) {
          const result = await applyChange(item);
          if (result.tree) { latestTree = result.tree; appliedCount += 1; }
          else failures.push(result.error || item.proposal.summary);
        }
      }
      const applied = appliedCount ? `Done — I applied ${appliedCount} ${appliedCount === 1 ? "update" : "updates"} to the family tree.` : "";
      const failed = failures.length ? `${failures.length} ${failures.length === 1 ? "change needs" : "changes need"} another look: ${failures.join("; ")}` : "";
      const questions = data.conflicts?.map((conflict) => `${conflict.question}\n${conflict.evidence.join(" · ")}`).join("\n\n") || "";
      const assistantText = [applied, failed, questions || (!applied && !failed ? data.reply : "")].filter(Boolean).join("\n\n") || "Done.";
      setMessages([...nextMessages, { role: "assistant", text: assistantText }]);
      const mentioned = latestTree.people.filter((person) => assistantText.toLocaleLowerCase().includes(person.displayName.toLocaleLowerCase()));
      if (mentioned.length) { setHighlightedIds(mentioned.map((person) => person.id)); setViewMode("tree"); }
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      if (folderRef.current) folderRef.current.value = "";
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "request_failed";
      const friendly = code === "openai_not_configured"
        ? "The archivist is ready, but the OpenAI key still needs to be connected."
        : code === "unsupported_file_type" ? "That file type is not supported yet. Try a PDF, image, text file, Word document, or spreadsheet."
        : code === "files_too_large" ? "Those files are too large. Keep each file under 50 MB and the total under 100 MB."
        : "The archivist could not finish that request. Please try again.";
      setError(friendly);
    } finally { setBusy(false); }
  }

  async function applyChange(item: PendingProposal): Promise<{ tree?: FamilyTree; error?: string }> {
    setProposals((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, state: "applying" } : candidate));
    try {
      const response = await fetch("/api/changes", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item.proposal),
      });
      const data = await response.json() as { tree?: FamilyTree; error?: string };
      if (!response.ok || !data.tree) throw new Error(data.error || "change_failed");
      setTree(data.tree);
      const appliedPersonId = item.proposal.kind === "add_person" ? data.tree.people.find((person) => person.displayName === item.proposal.person.displayName)?.id : undefined;
      setProposals((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, state: "applied", appliedPersonId } : candidate));
      return { tree: data.tree };
    } catch (error) {
      setProposals((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, state: "error" } : candidate));
      return { error: error instanceof Error ? error.message : "Change failed" };
    }
  }

  return (
    <main className={`min-h-screen bg-[var(--paper)] text-[var(--ink)] ${chatCollapsed ? "chat-collapsed" : ""}`} data-build-id={BUILD_ID} data-version={VERSION}>
      {authError && <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-center text-sm text-red-900">{authError === "not_invited" ? "Apple sign-in worked, but this Apple account is not on the family editor list." : authError === "apple_token_exchange_failed" ? "Apple returned an authentication error. Please try again, and contact the site owner if it continues." : "We could not complete Apple sign-in. Please try again."}</div>}

      <header className={`site-action-bar absolute top-0 z-50 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--paper)_92%,transparent)] px-6 backdrop-blur-xl sm:px-8 ${chatCollapsed ? "is-chat-collapsed" : ""}`}>
        <p className="text-base font-semibold tracking-[-.01em]">Darabiha</p>
        <nav className="archive-view-switcher" aria-label="Archive view">{(["tree", "timeline", "map"] as const).map((mode) => <button type="button" className={viewMode === mode ? "is-active" : ""} aria-current={viewMode === mode ? "page" : undefined} onClick={() => setViewMode(mode)} key={mode}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}</nav>
        <div className="relative flex items-center gap-4">
          {signInEnabled && !viewer.signedIn && <><span className="text-sm text-[var(--muted)]">Sign in to edit</span><a className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent)]" href={signInPath}>&nbsp; Sign in with Apple</a></>}
          {viewer.signedIn && <><button className="account-menu-button" aria-label="Account menu" onClick={() => setMenuOpen(!menuOpen)}>···</button>{menuOpen && <div className="absolute right-0 top-10 z-50 rounded-xl border border-[var(--line)] bg-white p-1 shadow-lg"><a className="block rounded-lg px-4 py-2 text-sm hover:bg-[var(--wash)]" href={signOutPath}>Sign out</a></div>}</>}
        </div>
      </header>
      <div className="family-shell flex h-screen min-h-0">
        <aside className={`chat-sidebar flex min-h-0 flex-col border-b border-[var(--line)] bg-[var(--sidebar)] lg:border-b-0 lg:border-r ${chatCollapsed ? "is-collapsed" : ""}`} aria-label="Family chat">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-6 sm:px-8">
            <div className="workspace-header mb-5 flex items-center justify-between">
              <span aria-hidden="true" />
              <div className="flex items-center gap-1">
                <button className="sidebar-toggle" onClick={() => setChatCollapsed(true)} aria-label="Collapse family chat" title="Collapse family chat">
                  <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3" width="15" height="14" rx="2" /><path d="M7 3v14M11.5 7.5 9 10l2.5 2.5" /></svg>
                </button>
              </div>
            </div>
            {!viewer.canEdit ? (
              <PublicArchiveChat signedIn={viewer.signedIn} tree={tree} onPeopleMentioned={(people) => { setHighlightedIds(people.map((person) => person.id)); setViewMode("tree"); }} />
            ) : (
              <>
                <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                  <div className="max-w-[18rem] rounded-2xl rounded-tl-sm border border-[var(--line)] bg-white px-4 py-3 text-sm leading-6 shadow-sm">
                    Welcome{viewer.displayName ? `, ${viewer.displayName.split(" ")[0]}` : ""}. Tell me what you remember, or attach a document or photo. I’ll add it to the family tree.
                  </div>
                  {messages.map((message, index) => (
                    <div className={`chat-bubble ${message.role === "user" ? "is-user" : ""}`} key={`${message.role}-${index}`}>{message.text}</div>
                  ))}
                  {busy && <div className="chat-bubble"><span className="agent-pulse" /> Thinking…</div>}
                  {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">{error}</p>}
                </div>
                <div className="pt-5">
                  <button className="mb-4 rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent)]" onClick={() => setAddingPerson(true)}>＋ Add a person</button>
                  {files.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{files.map((file) => <span className="file-chip" key={file.name}>{file.name}</span>)}</div>}
                  <div className="editor-composer rounded-[1.5rem] border border-[var(--line)] bg-white p-4 shadow-[0_12px_40px_rgba(62,45,28,0.08)]">
                    <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }} className="min-h-20 w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-[var(--muted)]" placeholder="Tell me what you remember…" aria-label="Message the family archivist" />
                    <div className="mt-2 flex items-center justify-between">
                      <input ref={fileRef} className="sr-only" type="file" multiple onChange={(event) => { const incoming = Array.from(event.target.files ?? []); setFiles((current) => [...current, ...incoming.filter((file) => !current.some((existing) => `${existing.name}:${existing.size}` === `${file.name}:${file.size}`))]); event.target.value = ""; }} />
                      <input ref={(node) => { folderRef.current = node; node?.setAttribute("webkitdirectory", ""); node?.setAttribute("directory", ""); }} className="sr-only" type="file" multiple onChange={(event) => { const incoming = Array.from(event.target.files ?? []); setFiles((current) => [...current, ...incoming.filter((file) => !current.some((existing) => `${existing.name}:${existing.size}` === `${file.name}:${file.size}`))]); event.target.value = ""; }} />
                      <div className="flex items-center gap-2"><button className="composer-file-button" onClick={() => fileRef.current?.click()} aria-label="Add files">＋ Add files</button><button className="composer-folder-button" onClick={() => folderRef.current?.click()} aria-label="Add a folder">Add folder</button></div>
                      <button className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ink)] text-white transition hover:bg-[var(--accent)] disabled:opacity-40" disabled={busy || (!input.trim() && !files.length)} onClick={sendMessage} aria-label="Send message">↑</button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
        <button className={`chat-edge-reveal ${chatCollapsed ? "is-visible" : ""}`} onClick={() => setChatCollapsed(false)} aria-label="Show family chat" title="Show family chat">›</button>
        <section className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="absolute inset-0 tree-grid opacity-20" aria-hidden="true" />
          <div className="relative h-full min-h-0">

            <div className="relative h-full min-h-0 overflow-hidden bg-[#eef4f1]">
              {viewMode === "tree" && (tree.people.length ? <FamilyTreeCanvas tree={tree} highlightedIds={highlightedIds} focusPersonId={highlightedIds[0]} onSelect={(person) => { setHighlightedIds([person.id]); setSelectedPerson(person); }} /> : <EmptyTree canEdit={viewer.canEdit} />)}
              {viewMode === "timeline" && <TimelineView tree={tree} onSelect={(person) => { setHighlightedIds([person.id]); setSelectedPerson(person); }} />}
              {viewMode === "map" && <WorldMapView tree={tree} onSelect={(person) => { setHighlightedIds([person.id]); setSelectedPerson(person); }} />}
            </div>
          </div>
        </section>

      </div>
      {selectedPerson && <PersonModalV2 key={selectedPerson.id} person={selectedPerson} tree={tree} canEdit={viewer.canEdit} onClose={() => { setSelectedPerson(null); setHighlightedIds([]); }} onSelect={(person) => { setHighlightedIds([person.id]); setSelectedPerson(person); }} onTreeChange={(next) => { setTree(next); setSelectedPerson(next.people.find((candidate) => candidate.id === selectedPerson.id) ?? null); }} />}
      {addingPerson && <AddPersonModal tree={tree} onClose={() => setAddingPerson(false)} onAdded={(next) => { setTree(next); setAddingPerson(false); }} />}
      <span className="build-version" aria-label={`Darabiha version ${VERSION}`}>Version {VERSION}</span>
    </main>
  );
}

function AddPersonModal({ tree, onClose, onAdded }: { tree: FamilyTree; onClose: () => void; onAdded: (tree: FamilyTree) => void }) {
  const [form, setForm] = useState({ displayName: "", gender: "" as "" | "male" | "female", birthDate: "", birthCity: "", birthCountry: "", deathDate: "", deathCity: "", deathCountry: "", biography: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<Person | null>(null);
  const normalized = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const candidate = () => tree.people.find((person) => normalized(person.displayName) === normalized(form.displayName));
  async function save(action: "add" | "update", personId?: string) { setBusy(true); setError(""); try { const body = action === "add" ? { action, ...form } : { action, personId, patch: form }; const response = await fetch("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json() as { tree?: FamilyTree; error?: string }; if (!response.ok || !data.tree) throw new Error(data.error || "Could not save person"); onAdded(data.tree); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save person"); } finally { setBusy(false); } }
  async function add() { if (!form.displayName.trim() || busy) return; const match = candidate(); if (match) { const sameDate = !form.birthDate || !match.birthDate || form.birthDate === match.birthDate; if (sameDate) { await save("update", match.id); return; } setDuplicate(match); return; } await save("add"); }
  const input = (label: string, field: keyof typeof form, type = "text") => <label className="person-editor-field"><span>{label}</span><input className="modal-input" type={type} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>;
  return <div className="person-modal-backdrop" role="presentation" onClick={onClose}><section className="person-modal" role="dialog" aria-modal="true" aria-labelledby="add-person-title" onClick={(event) => event.stopPropagation()}>
    <button className="person-modal-close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">New record</p><h2 id="add-person-title" className="font-serif text-3xl">Add a person</h2><p className="mt-2 text-sm text-[var(--muted)]">Enter what you know now. We’ll check the family tree before creating a new record.</p>
    {duplicate && <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6"><strong>{duplicate.displayName}</strong> is already in the tree, born {duplicate.birthDate || "with no recorded birth date"}. Is this the same person?<div className="mt-3 flex flex-wrap gap-2"><button className="rounded-full bg-[var(--ink)] px-4 py-2 text-xs font-semibold text-white" onClick={() => save("update", duplicate.id)}>Use existing person</button><button className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-xs font-semibold" onClick={() => { setDuplicate(null); save("add"); }}>Create new person</button></div></div>}
    <div className="modal-editor person-editor-grid">{input("Full name", "displayName")}<label className="person-editor-field"><span>Sex</span><select className="modal-input" value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value as typeof form.gender })}><option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option></select></label>{input("Birth date", "birthDate", "date")}{input("Birth city", "birthCity")}{input("Birth country", "birthCountry")}{input("Death date", "deathDate", "date")}{input("Death city", "deathCity")}{input("Death country", "deathCountry")}<label className="person-editor-field person-editor-wide"><span>Biography, memories, or notes</span><textarea className="modal-input min-h-24" value={form.biography} onChange={(event) => setForm({ ...form, biography: event.target.value })} /></label>{error && <p className="text-sm text-red-700">{error}</p>}<button className="rounded-full bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !form.displayName.trim()} onClick={add}>{busy ? "Checking…" : "Add person"}</button></div>
  </section></div>;
}

function PersonModal({ person, tree, canEdit, onClose, onSelect, onTreeChange }: { person: Person; tree: FamilyTree; canEdit: boolean; onClose: () => void; onSelect: (person: Person) => void; onTreeChange: (tree: FamilyTree) => void }) {
  const [form, setForm] = useState({ displayName: person.displayName, birthDate: person.birthDate ?? "", deathDate: person.deathDate ?? "", birthPlace: person.birthPlace ?? "", deathPlace: person.deathPlace ?? "", birthCity: person.birthCity ?? "", birthCountry: person.birthCountry ?? "", deathCity: person.deathCity ?? "", deathCountry: person.deathCountry ?? "", biography: person.biography ?? "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [newName, setNewName] = useState("");
  const [relativeId, setRelativeId] = useState("");
  const [relativeType, setRelativeType] = useState<"parent" | "child" | "spouse">("parent");
  const photoRef = useRef<HTMLInputElement>(null);
  const { parents, spouses, children, siblings, cousins } = relatedPeople(tree, person.id);
  async function save() { setSaving(true); setNotice(""); const response = await fetch("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", personId: person.id, patch: form }) }); const data = await response.json() as { tree?: FamilyTree; error?: string }; setSaving(false); if (response.ok && data.tree) { onTreeChange(data.tree); setNotice("Saved"); } else setNotice(data.error || "Could not save"); }
  return <div className="person-modal-backdrop" role="presentation" onClick={onClose}><section className="person-modal" role="dialog" aria-modal="true" aria-labelledby="person-modal-title" onClick={(event) => event.stopPropagation()}>
    <button className="person-modal-close" onClick={onClose} aria-label="Close">×</button>
    <input ref={photoRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const body = new FormData(); body.set("personId", person.id); body.set("photo", file); setNotice("Uploading photo…"); const response = await fetch("/api/people", { method: "POST", body }); const data = await response.json() as { tree?: FamilyTree; error?: string }; if (response.ok && data.tree) { onTreeChange(data.tree); setNotice("Photo added"); } else setNotice(data.error || "Could not upload photo"); event.target.value = ""; }} />
    <div className="person-photo-actions"><button type="button" className="person-modal-photo-button" onClick={() => canEdit && photoRef.current?.click()} aria-label={canEdit ? "Add or change photo" : "Profile photo"}>{person.photoAttachmentId ? <img className="person-modal-photo" src={`/api/photos/${person.photoAttachmentId}`} alt="" /> : <span className="person-modal-avatar">{person.displayName.slice(0, 1).toUpperCase()}<span className="avatar-upload-hint">＋ photo</span></span>}</button>{canEdit && person.photoAttachmentId && <button type="button" className="photo-remove-button" onClick={async () => { const response = await fetch("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "remove_photo", personId: person.id }) }); const data = await response.json() as { tree?: FamilyTree }; if (response.ok && data.tree) { onTreeChange(data.tree); setNotice("Photo removed"); } }}>Remove photo</button>}</div>
    <p className="eyebrow">Family member</p><h2 id="person-modal-title" className="font-serif text-3xl">{person.displayName}</h2><p className="mt-1 text-sm text-[var(--muted)]">{lifeLine(person)}</p><div className="mt-4 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2"><div><span className="eyebrow">Born</span><p>{person.birthDate || "Year not recorded"} · {locationLine(person.birthCity, person.birthCountry, person.birthPlace) || "Place not recorded"}</p></div><div><span className="eyebrow">Died</span><p>{person.deathDate || "Still living / unknown"} · {locationLine(person.deathCity, person.deathCountry, person.deathPlace) || "Place not recorded"}</p></div></div>
    {person.biography && <p className="mt-5 text-sm leading-6">{person.biography}</p>}
    <div className="modal-relationships">{[["Parents", parents, "parent"], ["Spouse", spouses, "spouse"], ["Children", children, "child"], ["Siblings", siblings, "parent"], ["Cousins", cousins, "parent"]].map(([label, people, type]) => (people as Person[]).length || canEdit ? <div key={label as string} className="relationship-group"><div className="flex items-center justify-between"><p className="eyebrow">{label as string}</p>{canEdit && <button type="button" className="relationship-add" aria-label={`Add ${String(label).toLowerCase()}`} onClick={() => { setRelativeType(type as typeof relativeType); document.getElementById("relationship-editor")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}>＋</button>}</div><div className="flex flex-wrap gap-2">{(people as Person[]).map((relative) => <button className="relationship-chip" key={relative.id} onClick={() => onSelect(relative)}>{relative.displayName}{relative.birthDate ? ` · ${relative.birthDate.slice(0, 4)}` : ""}</button>)}</div></div> : null)}</div>
    {canEdit && <div className="modal-editor"><p className="eyebrow">Edit record</p>{(["displayName", "birthDate", "deathDate", "birthPlace", "deathPlace"] as const).map((field) => <input key={field} className="modal-input" value={form[field]} placeholder={field.replace(/([A-Z])/g, " $1")} onChange={(event) => setForm({ ...form, [field]: event.target.value })} />)}<textarea className="modal-input min-h-20" value={form.biography} placeholder="Biography or notes" onChange={(event) => setForm({ ...form, biography: event.target.value })} /><div className="flex items-center justify-between"><button className="rounded-full bg-[var(--ink)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>{notice && <span className="text-xs text-[var(--muted)]">{notice}</span>}</div><p className="eyebrow mt-3">Add a relationship</p><div className="grid grid-cols-[1fr_auto_auto] gap-2"><select className="modal-input" value={relativeId} onChange={(event) => setRelativeId(event.target.value)}><option value="">Choose a person</option>{tree.people.filter((candidate) => candidate.id !== person.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.displayName}</option>)}</select><select className="modal-input" value={relativeType} onChange={(event) => setRelativeType(event.target.value as typeof relativeType)}><option value="parent">Parent</option><option value="child">Child</option><option value="spouse">Spouse</option></select><button className="rounded-full border border-[var(--line)] px-3 text-xs" disabled={!relativeId} onClick={async () => { const fromPersonId = relativeType === "child" ? relativeId : person.id; const toPersonId = relativeType === "child" ? person.id : relativeId; const response = await fetch("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "relationship", fromPersonId, toPersonId, relationshipType: relativeType === "child" ? "parent" : relativeType }) }); const data = await response.json() as { tree?: FamilyTree }; if (response.ok && data.tree) { onTreeChange(data.tree); setNotice("Relationship added"); } else setNotice("Could not add relationship"); }}>Add</button></div><p className="eyebrow mt-3">Add a name</p><div className="flex gap-2"><input className="modal-input" value={newName} placeholder="New family member" onChange={(event) => setNewName(event.target.value)} /><button className="rounded-full border border-[var(--line)] px-3 text-xs" onClick={async () => { if (!newName.trim()) return; const response = await fetch("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add", displayName: newName }) }); const data = await response.json() as { tree?: FamilyTree }; if (response.ok && data.tree) { onTreeChange(data.tree); setNewName(""); setNotice("Name added"); } }}>Add</button></div></div>}
  </section></div>;
}

function PersonModalV2({ person, tree, canEdit, onClose, onSelect, onTreeChange }: { person: Person; tree: FamilyTree; canEdit: boolean; onClose: () => void; onSelect: (person: Person) => void; onTreeChange: (tree: FamilyTree) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [relationEditor, setRelationEditor] = useState<string | null>(null);
  const [relativeQuery, setRelativeQuery] = useState("");
  const [relativeChoice, setRelativeChoice] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(() => ({ displayName: person.displayName, gender: person.gender ?? "" as "" | "male" | "female", birthDate: person.birthDate ?? "", deathDate: person.deathDate ?? "", birthCity: person.birthCity ?? "", birthCountry: person.birthCountry ?? "", deathCity: person.deathCity ?? "", deathCountry: person.deathCountry ?? "", biography: person.biography ?? "" }));
  const buckets = relatedPeople(tree, person.id);
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  async function post(body: Record<string, unknown>) { const response = await fetch("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json() as { tree?: FamilyTree; error?: string }; if (!response.ok || !data.tree) throw new Error(data.error || "Request failed"); onTreeChange(data.tree); return data.tree; }
  async function save() { setSaving(true); try { await post({ action: "update", personId: person.id, patch: form }); setEditing(false); setNotice("Saved"); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save"); } finally { setSaving(false); } }
  async function removeRelationship(id: string) { try { await post({ action: "remove_relationship", relationshipId: id }); setNotice("Relationship removed"); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not remove relationship"); } }
  async function deletePerson() { if (!window.confirm(`Remove ${person.displayName} and their family-tree connections? This cannot be undone.`)) return; setSaving(true); try { await post({ action: "remove", personId: person.id }); onClose(); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not remove person"); } finally { setSaving(false); } }
  async function addRelative(label: string) {
    if (!relativeQuery.trim() || saving) return;
    setSaving(true); setNotice("");
    try {
      let relative = tree.people.find((candidate) => candidate.id === relativeChoice);
      if (!relative) {
        const exact = tree.people.filter((candidate) => candidate.displayName.localeCompare(relativeQuery.trim(), undefined, { sensitivity: "base" }) === 0 && candidate.id !== person.id);
        if (exact.length > 1) throw new Error("Choose the correct matching person from the suggestions.");
        relative = exact[0];
      }
      if (!relative) {
        const before = new Set(tree.people.map((candidate) => candidate.id));
        const next = await post({ action: "add", displayName: relativeQuery.trim() });
        relative = next.people.find((candidate) => !before.has(candidate.id));
      }
      if (!relative) throw new Error("Could not identify that person.");
      const links = label === "Parents" ? [{ fromPersonId: relative.id, toPersonId: person.id }]
        : label === "Children" ? [{ fromPersonId: person.id, toPersonId: relative.id }]
        : label === "Spouse" ? [{ fromPersonId: person.id, toPersonId: relative.id, relationshipType: "spouse" }]
        : buckets.parents.map((parent) => ({ fromPersonId: parent.id, toPersonId: relative!.id }));
      if (!links.length) throw new Error("Add a parent first so this sibling can share the correct parents.");
      for (const link of links) await post({ action: "relationship", relationshipType: "parent", ...link });
      setRelationEditor(null); setRelativeQuery(""); setRelativeChoice(""); setNotice(`${label.replace(/s$/, "")} added`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not add relative"); }
    finally { setSaving(false); }
  }
  const relation = (other: Person, label: string) => tree.relationships.find((link) => (label === "Spouse" && link.type === "spouse" && ((link.fromPersonId === person.id && link.toPersonId === other.id) || (link.toPersonId === person.id && link.fromPersonId === other.id))) || (label === "Parents" && link.type === "parent" && link.fromPersonId === other.id && link.toPersonId === person.id) || (label === "Children" && link.type === "parent" && link.fromPersonId === person.id && link.toPersonId === other.id));
  const field = (label: string, key: keyof typeof form, type = "text") => <label className="person-editor-field"><span>{label}</span><input className="modal-input" type={type} value={form[key]} onChange={(event) => update(key, event.target.value)} /></label>;
  return <div className="person-modal-backdrop person-drawer-backdrop" role="presentation" onClick={onClose}><section className="person-modal person-modal-v2" role="dialog" aria-modal="true" aria-labelledby="person-modal-title" onClick={(event) => event.stopPropagation()}>
    <button className="person-modal-close" onClick={onClose} aria-label="Close">×</button>
    <input ref={photoRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const body = new FormData(); body.set("personId", person.id); body.set("photo", file); const response = await fetch("/api/people", { method: "POST", body }); const data = await response.json() as { tree?: FamilyTree; error?: string }; if (response.ok && data.tree) { onTreeChange(data.tree); setNotice("Photo updated"); } else setNotice(data.error || "Could not upload photo"); event.target.value = ""; }} />
    <div className="person-modal-hero"><button type="button" className="person-modal-photo-button" onClick={() => canEdit && photoRef.current?.click()} aria-label={canEdit ? "Change portrait" : "Portrait"}>{person.photoAttachmentId ? <img className="person-modal-photo" src={`/api/photos/${person.photoAttachmentId}`} alt="" /> : <span className="person-modal-avatar">{person.displayName.slice(0, 1).toUpperCase()}</span>}</button><div><p className="eyebrow">Family member</p><div className="person-title-row"><h2 id="person-modal-title" className="font-serif text-4xl">{person.displayName}</h2>{canEdit && <button className="edit-button" onClick={() => setEditing((value) => !value)} aria-label={editing ? "Close editor" : "Edit person"}>{editing ? "Done" : "Edit"}</button>}</div><p className="person-life-line">{lifeLine(person)}</p></div></div>
    <div className="person-facts"><div><span className="eyebrow">Born</span><p>{person.birthDate ? `Born ${formatDate(person.birthDate)}` : "Birth date not recorded"}{locationLine(person.birthCity, person.birthCountry, person.birthPlace) ? ` in ${locationLine(person.birthCity, person.birthCountry, person.birthPlace)}` : ""}</p></div><div><span className="eyebrow">Died</span><p>{person.deathDate ? `Died ${formatDate(person.deathDate)}` : "Still living / unknown"}{locationLine(person.deathCity, person.deathCountry, person.deathPlace) ? ` in ${locationLine(person.deathCity, person.deathCountry, person.deathPlace)}` : ""}</p></div></div>
    {person.biography && <p className="person-biography">{person.biography}</p>}
    <div className="modal-relationships">{([['Parents', buckets.parents], ['Spouse', buckets.spouses], ['Children', buckets.children], ['Siblings', buckets.siblings]] as [string, Person[]][]).map(([label, people]) => <div className="relationship-group" key={label}><div className="relationship-heading"><p className="eyebrow">{label}</p>{canEdit && <button type="button" className="relationship-add" onClick={() => { setRelationEditor(relationEditor === label ? null : label); setRelativeQuery(""); setRelativeChoice(""); }} aria-label={`Add ${label.toLocaleLowerCase()}`}>＋</button>}</div><div className="relationship-chips">{people.map((relative) => <span className="relationship-chip-wrap" key={relative.id}><button className="relationship-chip" onClick={() => onSelect(relative)}>{relative.displayName}{relative.birthDate ? ` · ${relative.birthDate.slice(0, 4)}` : ""}{locationLine(relative.birthCity, relative.birthCountry, relative.birthPlace) ? ` · ${locationLine(relative.birthCity, relative.birthCountry, relative.birthPlace)}` : ""}</button>{canEdit && relation(relative, label) && <button className="relationship-remove" onClick={() => removeRelationship(relation(relative, label)!.id)} aria-label={`Remove ${relative.displayName}`}>×</button>}</span>)}</div>{relationEditor === label && <div className="relative-picker"><input className="modal-input" value={relativeQuery} autoFocus placeholder={`Find or create a ${label.toLocaleLowerCase().replace(/s$/, "")}`} onChange={(event) => { setRelativeQuery(event.target.value); setRelativeChoice(""); }} />{relativeQuery.trim() && <div className="relative-suggestions">{tree.people.filter((candidate) => candidate.id !== person.id && candidate.displayName.toLocaleLowerCase().includes(relativeQuery.trim().toLocaleLowerCase())).slice(0, 6).map((candidate) => <button type="button" key={candidate.id} onClick={() => { setRelativeChoice(candidate.id); setRelativeQuery(candidate.displayName); }}><strong>{candidate.displayName}</strong><span>{candidate.birthDate?.slice(0, 4) || "Year unknown"}{locationLine(candidate.birthCity, candidate.birthCountry, candidate.birthPlace) ? ` · ${locationLine(candidate.birthCity, candidate.birthCountry, candidate.birthPlace)}` : ""}</span></button>)}</div>}<button type="button" className="relative-add-button" disabled={!relativeQuery.trim() || saving} onClick={() => addRelative(label)}>{relativeChoice ? "Add selected person" : "Use this name"}</button></div>}</div>)}</div>
    {canEdit && editing && <div className="modal-editor person-editor-grid">{field("Name", "displayName")}<label className="person-editor-field"><span>Sex</span><select className="modal-input" value={form.gender} onChange={(event) => update("gender", event.target.value)}><option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option></select></label>{field("Birth date", "birthDate", "date")}{field("Birth city", "birthCity")}{field("Birth country", "birthCountry")}{field("Death date", "deathDate", "date")}{field("Death city", "deathCity")}{field("Death country", "deathCountry")}<label className="person-editor-field person-editor-wide"><span>Biography</span><textarea className="modal-input" value={form.biography} onChange={(event) => update("biography", event.target.value)} /></label><div className="editor-actions"><button className="rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-semibold text-white" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>{person.photoAttachmentId && <button className="photo-remove-button" onClick={async () => { try { await post({ action: "remove_photo", personId: person.id }); setNotice("Photo removed"); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not remove photo"); } }}>Remove portrait</button>}</div></div>}
    {notice && <p className="modal-notice" role="status">{notice}</p>}
    {canEdit && <div className="person-delete-footer"><button className="person-delete-button" disabled={saving} onClick={deletePerson}>Delete person</button></div>}
  </section></div>;
}

function EmptyTree({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="m-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--wash)] font-serif text-2xl text-[var(--accent)]">D</span>
      <h2 className="mt-5 font-serif text-3xl tracking-[-.025em] text-white">The first branch starts here.</h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">{canEdit ? "Tell the archivist about one family member to begin the record." : "The family is gathering names, dates, photographs, and stories for this living archive."}</p>
    </div>
  );
}

function PublicArchiveChat({ signedIn, tree, onPeopleMentioned }: { signedIn: boolean; tree: FamilyTree; onPeopleMentioned: (people: Person[]) => void }) {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<string[]>([]);
  async function ask() {
    const text = question.trim();
    if (!text || busy) return;
    setAsked((current) => [...current, text]);
    setQuestion("");
    setBusy(true); setReply("");
    try { const response = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) }); const data = await response.json() as { reply?: string; error?: string }; const answer = response.ok ? data.reply || "No answer recorded." : "The archivist could not answer right now."; setReply(answer); onPeopleMentioned(tree.people.filter((person) => answer.toLocaleLowerCase().includes(person.displayName.toLocaleLowerCase()))); } finally { setBusy(false); }
  }
  return (
    <div className="public-chat flex h-full min-h-0 w-full flex-col">
      <div className={`flex flex-1 flex-col items-center overflow-y-auto pb-5 text-center ${asked.length ? "justify-start" : "justify-center"}`}>
        {!asked.length ? <><h3 className="mt-0 font-serif text-2xl">The Darabiha family tree</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Explore our family history, ask about the people and relationships in the tree, and discover the stories recorded here.</p>{signedIn && <p className="public-chat-note mt-5 text-xs leading-5 text-[var(--muted)]">You&apos;re signed in, but this Apple account isn&apos;t authorized to edit this family tree.</p>}</> : <div className="public-chat-thread w-full pt-4 text-left">{asked.map((message, index) => <div className="public-chat-user-bubble" key={`${message}-${index}`}>{message}</div>)}{busy && <p className="public-chat-syncing"><span className="agent-pulse" /> Thinking…</p>}{!busy && reply && <p className="public-chat-answer">{reply}</p>}</div>}
      </div>
      <div>
        <div className="public-chat-composer editor-composer relative w-full rounded-[1.5rem] border border-[var(--line)] bg-white p-4 shadow-[0_12px_40px_rgba(62,45,28,0.08)]">
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(); } }} className="min-h-24 w-full resize-none bg-transparent px-2 py-1 pr-12 text-sm leading-6 outline-none placeholder:text-[var(--muted)]" placeholder="Who are the children of…?" aria-label="Search the family archive" />
          <button onClick={ask} disabled={busy || !question.trim()} className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ink)] text-white transition hover:bg-[var(--accent)] disabled:opacity-40" aria-label="Search the family archive">↑</button>
        </div>
      </div>
    </div>
  );
}
