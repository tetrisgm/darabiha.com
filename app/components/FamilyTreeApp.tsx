"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ChangeProposal, FamilyTree, Person } from "../../lib/types";

type Props = {
  initialTree: FamilyTree;
  viewer: { signedIn: boolean; canEdit: boolean; displayName: string | null };
  signInPath: string;
  signOutPath: string;
};

type ChatMessage = { role: "user" | "assistant"; text: string };
type PendingProposal = { id: string; proposal: ChangeProposal; state: "pending" | "applying" | "applied" | "error" };

function generationGroups(tree: FamilyTree): Person[][] {
  if (!tree.people.length) return [];
  const level = new Map(tree.people.map((person) => [person.id, 0]));
  const parentLinks = tree.relationships.filter((relationship) => relationship.type === "parent");
  for (let pass = 0; pass < tree.people.length; pass += 1) {
    let changed = false;
    for (const link of parentLinks) {
      const next = (level.get(link.fromPersonId) ?? 0) + 1;
      if ((level.get(link.toPersonId) ?? 0) < next) {
        level.set(link.toPersonId, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const link of tree.relationships.filter((relationship) => relationship.type === "spouse")) {
    const shared = Math.max(level.get(link.fromPersonId) ?? 0, level.get(link.toPersonId) ?? 0);
    level.set(link.fromPersonId, shared);
    level.set(link.toPersonId, shared);
  }
  const groups: Person[][] = [];
  for (const person of tree.people) {
    const index = level.get(person.id) ?? 0;
    (groups[index] ??= []).push(person);
  }
  return groups.filter(Boolean);
}

function lifeLine(person: Person) {
  if (!person.birthDate && !person.deathDate) return "Dates not recorded";
  return `${person.birthDate ?? "?"} – ${person.deathDate ?? "present"}`;
}

function proposalLabel(proposal: ChangeProposal) {
  if (proposal.kind === "add_person") return `Add ${proposal.person.displayName}`;
  if (proposal.kind === "update_person") return `Update ${proposal.patch.displayName}`;
  if (proposal.kind === "add_relationship") return `Record ${proposal.relationshipType} relationship`;
  return `Save “${proposal.title}”`;
}

export default function FamilyTreeApp({ initialTree, viewer, signInPath, signOutPath }: Props) {
  const [tree, setTree] = useState(initialTree);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const generations = useMemo(() => generationGroups(tree), [tree]);

  async function sendMessage() {
    const text = input.trim();
    if ((!text && !files.length) || busy) return;
    const nextMessages = [...messages, { role: "user" as const, text: text || `Attached ${files.map((file) => file.name).join(", ")}` }];
    setMessages(nextMessages);
    setInput(""); setError(""); setBusy(true);
    const form = new FormData();
    form.set("message", text);
    form.set("history", JSON.stringify(messages.slice(-6)));
    files.forEach((file) => form.append("files", file));
    try {
      const response = await fetch("/api/agent", { method: "POST", body: form });
      const data = await response.json() as { reply?: string; proposals?: ChangeProposal[]; error?: string };
      if (!response.ok) throw new Error(data.error || "request_failed");
      setMessages([...nextMessages, { role: "assistant", text: data.reply || "I prepared that for review." }]);
      if (data.proposals?.length) {
        setProposals((current) => [...current, ...data.proposals!.map((proposal) => ({ id: crypto.randomUUID(), proposal, state: "pending" as const }))]);
      }
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "request_failed";
      const friendly = code === "openai_not_configured"
        ? "The archivist is ready, but the OpenAI key still needs to be connected."
        : code === "unsupported_file_type" ? "That file type is not supported yet. Try a PDF, image, text file, Word document, or spreadsheet."
        : code === "files_too_large" ? "Those files are too large. Keep each file under 10 MB and the total under 20 MB."
        : "The archivist could not finish that request. Please try again.";
      setError(friendly);
    } finally { setBusy(false); }
  }

  async function applyChange(item: PendingProposal) {
    setProposals((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, state: "applying" } : candidate));
    try {
      const response = await fetch("/api/changes", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item.proposal),
      });
      const data = await response.json() as { tree?: FamilyTree; error?: string };
      if (!response.ok || !data.tree) throw new Error(data.error || "change_failed");
      setTree(data.tree);
      setProposals((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, state: "applied" } : candidate));
    } catch {
      setProposals((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, state: "error" } : candidate));
    }
  }

  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <header className="flex h-20 items-center justify-between border-b border-[var(--line)] px-5 sm:px-8 lg:px-12">
        <Link className="font-serif text-xl tracking-[-0.02em]" href="/">Darabiha</Link>
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <span className="hidden sm:inline">The Darabi family archive</span>
          <span className="h-1 w-1 rounded-full bg-[var(--accent)]" />
          <a className="rounded-full border border-[var(--line)] bg-white px-4 py-2 font-medium text-[var(--ink)] shadow-sm transition hover:border-[var(--accent)]" href={viewer.signedIn ? signOutPath : signInPath}>
            {viewer.signedIn ? "Sign out" : "Family sign in"}
          </a>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-5rem)] lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="relative overflow-hidden px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          <div className="absolute inset-0 tree-grid opacity-45" aria-hidden="true" />
          <div className="relative mx-auto max-w-5xl">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Family tree</p>
                <h1 className="max-w-2xl font-serif text-4xl leading-[1.05] tracking-[-0.035em] sm:text-5xl">A living record of where we come from.</h1>
              </div>
              <span className="rounded-full border border-[var(--line)] bg-white/75 px-4 py-2 text-xs text-[var(--muted)]">
                {tree.people.length} {tree.people.length === 1 ? "person" : "people"} · {tree.stories.length} {tree.stories.length === 1 ? "story" : "stories"}
              </span>
            </div>

            <div className="relative flex min-h-[580px] flex-col items-center gap-14 rounded-[2rem] border border-[var(--line)] bg-white/60 px-5 py-12 shadow-[0_24px_80px_rgba(62,45,28,0.06)] backdrop-blur-sm sm:px-10">
              {generations.length ? generations.map((generation, generationIndex) => (
                <div className="tree-generation relative flex w-full flex-wrap justify-center gap-4 sm:gap-8" key={generationIndex}>
                  {generation.map((person) => (
                    <button className="person-card" key={person.id} title={person.biography || person.displayName}>
                      <span className="person-avatar" aria-hidden="true">{person.displayName.slice(0, 1).toUpperCase()}</span>
                      <span className="min-w-0 text-left">
                        <span className="block truncate font-serif text-lg leading-tight">{person.displayName}</span>
                        <span className="mt-1 block text-xs text-[var(--muted)]">{lifeLine(person)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )) : <EmptyTree canEdit={viewer.canEdit} />}

              {tree.stories.length > 0 && (
                <div className="mt-auto w-full border-t border-[var(--line)] pt-5">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Recent family stories</p>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {tree.stories.slice(0, 4).map((story) => (
                      <article className="min-w-56 rounded-xl bg-[var(--wash)] p-4" key={story.id}>
                        <h3 className="font-serif text-lg">{story.title}</h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{story.body}</p>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="flex min-h-[640px] flex-col border-t border-[var(--line)] bg-[var(--sidebar)] lg:border-l lg:border-t-0">
          <div className="border-b border-[var(--line)] px-6 py-6 sm:px-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Family archivist</p>
                <h2 className="mt-1 font-serif text-2xl tracking-[-0.025em]">Add to our story</h2>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-sm text-white">✦</span>
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden px-6 py-6 sm:px-8">
            {!viewer.canEdit ? (
              <AccessPrompt signedIn={viewer.signedIn} signInPath={signInPath} />
            ) : (
              <>
                <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                  <div className="max-w-[18rem] rounded-2xl rounded-tl-sm border border-[var(--line)] bg-white px-4 py-3 text-sm leading-6 shadow-sm">
                    Welcome{viewer.displayName ? `, ${viewer.displayName.split(" ")[0]}` : ""}. Tell me what you remember, or attach a document or photo. I’ll prepare changes for you to review.
                  </div>
                  {messages.map((message, index) => (
                    <div className={`chat-bubble ${message.role === "user" ? "is-user" : ""}`} key={`${message.role}-${index}`}>{message.text}</div>
                  ))}
                  {busy && <div className="chat-bubble"><span className="agent-pulse" /> Reading the family record…</div>}
                  {proposals.map((item) => (
                    <div className="proposal-card" key={item.id}>
                      <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--accent)]">Suggested change</p>
                      <h3 className="mt-1 font-serif text-lg">{proposalLabel(item.proposal)}</h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.proposal.summary}</p>
                      <button className="mt-3 w-full rounded-full bg-[var(--ink)] px-4 py-2 text-xs font-semibold text-white disabled:cursor-default disabled:opacity-50" disabled={item.state === "applying" || item.state === "applied"} onClick={() => applyChange(item)}>
                        {item.state === "applied" ? "Added to the tree ✓" : item.state === "applying" ? "Applying…" : item.state === "error" ? "Try again" : "Review complete · apply"}
                      </button>
                    </div>
                  ))}
                  {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">{error}</p>}
                </div>

                <div className="pt-5">
                  {!messages.length && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {["Add a relative", "Record a marriage", "Attach a photo", "Tell a family story"].map((prompt) => (
                        <button className="prompt-chip" key={prompt} onClick={() => { setInput(prompt); inputRef.current?.focus(); }}>{prompt}</button>
                      ))}
                    </div>
                  )}
                  {files.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{files.map((file) => <span className="file-chip" key={file.name}>{file.name}</span>)}</div>}
                  <div className="rounded-2xl border border-[var(--line)] bg-white p-3 shadow-[0_12px_40px_rgba(62,45,28,0.08)]">
                    <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }} className="min-h-20 w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-[var(--muted)]" placeholder="Tell me what you remember…" aria-label="Message the family archivist" />
                    <div className="mt-2 flex items-center justify-between">
                      <input ref={fileRef} className="sr-only" type="file" multiple accept=".pdf,.txt,.md,.csv,.docx,.xlsx,image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
                      <button className="flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--wash)]" onClick={() => fileRef.current?.click()}><span className="text-lg" aria-hidden="true">＋</span> Attach</button>
                      <button className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ink)] text-white transition hover:bg-[var(--accent)] disabled:opacity-40" disabled={busy || (!input.trim() && !files.length)} onClick={sendMessage} aria-label="Send message">↑</button>
                    </div>
                  </div>
                  <p className="mt-3 text-center text-[11px] leading-5 text-[var(--muted)]">Nothing changes until you review and apply it.</p>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function EmptyTree({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="m-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--wash)] font-serif text-2xl text-[var(--accent)]">D</span>
      <h2 className="mt-5 font-serif text-3xl tracking-[-.025em]">The first branch starts here.</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{canEdit ? "Tell the archivist about one family member to begin the record." : "The family is gathering names, dates, photographs, and stories for this living archive."}</p>
    </div>
  );
}

function AccessPrompt({ signedIn, signInPath }: { signedIn: boolean; signInPath: string }) {
  return (
    <div className="m-auto max-w-xs text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-xl text-[var(--accent)] shadow-sm">✦</span>
      <h3 className="mt-5 font-serif text-2xl">{signedIn ? "Family editors only" : "Help build the tree"}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{signedIn ? "You’re signed in, but this account is not on the family editor list." : "The tree is public. Adding or changing family history is reserved for invited editors."}</p>
      {!signedIn && <a className="mt-5 inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white" href={signInPath}><span className="text-base" aria-hidden="true"></span> Sign in with Apple</a>}
    </div>
  );
}
