"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentConflict, ChangeProposal, FamilyTree, Person } from "../../lib/types";
import { relatedPeople } from "../../lib/relationships";
import { CalendarView, StatisticsView, TimelineView, WorldMapView } from "./ArchiveViews";
import type { MappedPlace } from "../../lib/archive-views";
import { FocusFamilyView, MissingDataView, OutlineView, Silhouette, TreeSearch } from "./TreeViews";
import { FamilyTreeCanvas } from "./FamilyTreeCanvas";
import { Markdown } from "./Markdown";
import { useLanguage } from "./LanguageContext";
import { LANGUAGES, LANGUAGE_FLAGS, LANGUAGE_NAMES } from "../../lib/i18n";
import { BUILD_ID, VERSION } from "../../lib/build";

type Props = {
  initialTree: FamilyTree | null;
  viewer: { signedIn: boolean; canEdit: boolean; role: "admin" | "editor" | "viewer" | null; displayName: string | null };
  signOutPath: string;
  signInEnabled: boolean;
};

type ChatMessage = { role: "user" | "assistant"; text: string };
type PendingProposal = { id: string; proposal: ChangeProposal; state: "pending" | "applying" | "applied" | "error"; appliedPersonId?: string };
type FamilyNote = { id: string; personId: string; authorName: string; body: string; createdAt: string };

function proposalRank(proposal: ChangeProposal) {
  if (proposal.kind === "add_person") return 0;
  if (proposal.kind === "update_person") return 1;
  if (proposal.kind === "add_relationship") return 2;
  if (proposal.kind === "add_story" || proposal.kind === "update_story") return 3;
  return 4;
}


function locationLine(city: string | null, country: string | null, fallback: string | null) { return city || country ? [city, country].filter(Boolean).join(", ") : fallback; }

const EMPTY_TREE: FamilyTree = { people: [], relationships: [], stories: [] };
const VIEW_MODES = ["family", "tree", "list", "timeline", "calendar", "map", "stats", "fill"] as const;
type ViewMode = (typeof VIEW_MODES)[number];
const VIEW_KEYS: Record<ViewMode, string> = { family: "view.family", tree: "view.tree", list: "view.list", timeline: "view.timeline", calendar: "view.calendar", map: "view.map", stats: "view.stats", fill: "view.fill" };

export default function FamilyTreeApp({ initialTree, viewer, signOutPath, signInEnabled }: Props) {
  const { t, lang, setLang } = useLanguage();
  const [tree, setTree] = useState(initialTree ?? EMPTY_TREE);
  const [treeLoaded, setTreeLoaded] = useState(Boolean(initialTree));
  useEffect(() => {
    if (treeLoaded) return;
    let cancelled = false;
    fetch("/api/tree")
      .then((response) => response.json() as Promise<FamilyTree>)
      .then((data) => { if (!cancelled) { setTree(data); setTreeLoaded(true); } })
      .catch(() => { if (!cancelled) setTreeLoaded(true); });
    return () => { cancelled = true; };
  }, [treeLoaded]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [, setProposals] = useState<PendingProposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [focalId, setFocalId] = useState<string | null>(null);
  const treeRef = useRef(initialTree ?? EMPTY_TREE);
  useEffect(() => { treeRef.current = tree; }, [tree]);
  const openPerson = (person: Person, push = true, refocus = true) => {
    if (refocus) setFocalId(person.id);
    setSelectedPerson(person);
    setHighlightedIds([person.id]);
    if (push && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("p") !== person.id) {
      window.history.pushState({ personId: person.id }, "", `?p=${person.id}`);
    }
  };
  const closePerson = () => {
    setSelectedPerson(null);
    setHighlightedIds([]);
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("p")) {
      window.history.pushState({ personId: null }, "", window.location.pathname);
    }
  };
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const fromState = (event.state as { personId?: string | null } | null)?.personId;
      const id = fromState !== undefined ? fromState : new URLSearchParams(window.location.search).get("p");
      if (id) {
        const person = treeRef.current.people.find((candidate) => candidate.id === id);
        if (person) { setFocalId(person.id); setSelectedPerson(person); setHighlightedIds([person.id]); }
      } else {
        setSelectedPerson(null);
        setHighlightedIds([]);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!treeLoaded) return;
    const id = new URLSearchParams(window.location.search).get("p");
    const person = id ? treeRef.current.people.find((candidate) => candidate.id === id) : undefined;
    if (person) {
      setFocalId(person.id);
      setSelectedPerson(person);
      setHighlightedIds([person.id]);
      window.history.replaceState({ personId: person.id }, "", `?p=${person.id}`);
    }
  }, [treeLoaded]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<Person | null>(null);
  // Map mode: a clicked city opens the panel as a list of its people; opening
  // one of them swaps in the profile, and closing it returns to the list.
  const [placeFocus, setPlaceFocus] = useState<MappedPlace | null>(null);
  // The profile panel takes exactly this width, so the two are one column and
  // no view is ever half-hidden behind a panel.
  const [chatWidth, setChatWidth] = useState(480);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = Number(window.localStorage.getItem("darabiha-chat-width"));
        if (saved >= 420 && saved <= 620) setChatWidth(saved);
      } catch { /* private mode */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const startChatResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = chatWidth;
    const clampWidth = (value: number) => Math.min(620, Math.max(420, value));
    // a fast resize drag sweeps across the chat text; suspend selection until release
    document.body.style.userSelect = "none";
    const onMove = (move: PointerEvent) => setChatWidth(clampWidth(startWidth + move.clientX - startX));
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      try { window.localStorage.setItem("darabiha-chat-width", String(clampWidth(startWidth + up.clientX - startX))); } catch { /* private mode */ }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const [viewMode, setViewModeState] = useState<ViewMode>("family");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem("darabiha-view");
        if (saved && (VIEW_MODES as readonly string[]).includes(saved) && !(saved === "fill" && !viewer.canEdit)) setViewModeState(saved as ViewMode);
      } catch { /* private mode */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [viewer.canEdit]);
  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    if (mode !== "map") setPlaceFocus(null);
    try { window.localStorage.setItem("darabiha-view", mode); } catch { /* private mode */ }
  };
  // what the archive volunteers before it is asked: an anniversary today, or
  // a fact about the family, with openers worth tapping
  const [greeting, setGreeting] = useState<{ fact: string | null; personId: string | null; suggestions: string[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/greeting")
      .then((response) => response.ok ? response.json() as Promise<{ fact: string | null; personId: string | null; suggestions: string[] }> : null)
      .then((data) => { if (!cancelled && data) setGreeting(data); })
      .catch(() => { /* the chat works without it */ });
    return () => { cancelled = true; };
  }, []);
  const openGreetingPerson = () => {
    const person = greeting?.personId ? tree.people.find((candidate) => candidate.id === greeting.personId) : null;
    if (person) openPerson(person);
  };
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
    form.set("message", selectedPerson ? `[We are currently viewing the record of ${selectedPerson.displayName} (person id ${selectedPerson.id}). Unless another person is named, apply details and answers to this person.]\n${text}` : text);
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
      const proposal = item.proposal;
      const appliedPersonId = proposal.kind === "add_person" ? data.tree.people.find((person) => person.displayName === proposal.person.displayName)?.id : undefined;
      setProposals((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, state: "applied", appliedPersonId } : candidate));
      return { tree: data.tree };
    } catch (error) {
      setProposals((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, state: "error" } : candidate));
      return { error: error instanceof Error ? error.message : "Change failed" };
    }
  }

  const focal = useMemo(() => {
    const explicit = focalId ? tree.people.find((person) => person.id === focalId) : undefined;
    if (explicit) return explicit;
    return tree.people.find((person) => person.displayName === "Nasser Darabiha") ?? tree.people[0];
  }, [tree, focalId]);

  return (
    <main className={`min-h-screen bg-[var(--paper)] text-[var(--ink)] ${chatCollapsed ? "chat-collapsed" : ""} ${selectedPerson || (placeFocus && viewMode === "map") ? "has-person" : ""}`} style={{ "--chat-width": `${chatWidth}px` } as React.CSSProperties} data-build-id={BUILD_ID} data-version={VERSION}>
      {authError && <div className="border-b border-[rgba(226,140,115,.35)] bg-[rgba(226,140,115,.12)] px-5 py-3 text-center text-sm text-[#e8a289]">{authError === "not_invited" ? "Apple sign-in worked, but this Apple account is not on the family editor list." : authError === "apple_token_exchange_failed" ? "Apple returned an authentication error. Please try again, and contact the site owner if it continues." : "We could not complete Apple sign-in. Please try again."}</div>}

      <header className={`site-action-bar absolute top-0 z-50 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--paper)_92%,transparent)] px-6 backdrop-blur-xl sm:px-8 ${chatCollapsed ? "is-chat-collapsed" : ""}`}>
        <button type="button" className="site-wordmark text-base font-semibold tracking-[-.01em]" onClick={() => setViewMode("family")} aria-label={t("nav.home")}>Darabiha</button>
        <nav className="archive-view-switcher" aria-label="Archive view">{VIEW_MODES.filter((mode) => mode !== "fill" || viewer.canEdit).map((mode) => <button type="button" className={viewMode === mode ? "is-active" : ""} aria-current={viewMode === mode ? "page" : undefined} onClick={() => setViewMode(mode)} key={mode}>{t(VIEW_KEYS[mode])}</button>)}</nav>
        <div className="relative flex items-center gap-4">
          <div className="lang-switch" role="group" aria-label={t("settings.language")}>
            <span className="lang-switch-label">{t("settings.language")}</span>
            {LANGUAGES.map((code) => <button type="button" key={code} lang={code}
              className={`lang-pick ${lang === code ? "is-active" : ""}`}
              aria-pressed={lang === code} title={LANGUAGE_NAMES[code]}
              onClick={() => setLang(code)}>
              <span aria-hidden="true">{LANGUAGE_FLAGS[code]}</span>
              <span className="lang-pick-name">{LANGUAGE_NAMES[code]}</span>
            </button>)}
          </div>
          <TreeSearch tree={tree} onPick={(person) => openPerson(person)} />
          {signInEnabled && !viewer.signedIn && <a className="rounded-full bg-[var(--accent-fill)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3a604a]" href="/settings">{t("nav.signIn")}</a>}
          {viewer.signedIn && <><button className="account-menu-button" aria-label={t("nav.account")} onClick={() => setMenuOpen(!menuOpen)}>···</button>{menuOpen && <div className="absolute right-0 top-10 z-50 rounded-xl border border-[var(--line)] bg-[var(--card)] p-1 shadow-lg"><a className="block rounded-lg px-4 py-2 text-sm hover:bg-[var(--wash)]" href="/settings">{t("nav.settings")}</a><a className="block rounded-lg px-4 py-2 text-sm hover:bg-[var(--wash)]" href={signOutPath}>{t("nav.signOut")}</a></div>}</>}
          {!viewer.signedIn && <a className="settings-gear" href="/settings" aria-label="Site settings" title="Site settings">⚙</a>}
        </div>
      </header>
      <div className="family-shell flex h-screen min-h-0">
        <aside className={`chat-sidebar flex min-h-0 flex-col border-b border-[var(--line)] bg-[var(--sidebar)] lg:border-b-0 lg:border-r ${chatCollapsed ? "is-collapsed" : ""}`} aria-label="Family chat">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-6 sm:px-8">
            <div className="workspace-header mb-5 flex items-center justify-between">
              <span aria-hidden="true" />
              <div className="flex items-center gap-1">
                <button className="sidebar-toggle" onClick={() => setChatCollapsed(true)} aria-label={t("chat.collapse")} title={t("chat.collapse")}>
                  <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3" width="15" height="14" rx="2" /><path d="M7 3v14M11.5 7.5 9 10l2.5 2.5" /></svg>
                </button>
              </div>
            </div>
            {!viewer.canEdit ? (
              <PublicArchiveChat signedIn={viewer.signedIn} tree={tree} focusPerson={selectedPerson} onClearFocus={closePerson} onOpenPerson={(person) => openPerson(person)} onPeopleMentioned={(people) => { setHighlightedIds(people.map((person) => person.id)); setViewMode("tree"); }} />
            ) : (
              <>
                <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                  {!selectedPerson && <div className="max-w-[18rem] rounded-2xl rounded-tl-sm border border-[var(--line)] bg-[var(--card)] px-4 py-3 text-sm leading-6 shadow-sm">
                    {t("chat.welcome", { name: viewer.displayName ? `, ${viewer.displayName.split(" ")[0]}` : "" })}
                  </div>}
                  {!selectedPerson && greeting?.fact && messages.length === 0 && <button type="button" className="chat-fact" onClick={openGreetingPerson} disabled={!greeting.personId}>
                    <span className="chat-fact-label">{t("chat.fromArchive")}</span>
                    <span>{greeting.fact}</span>
                  </button>}
                  {messages.length === 0 && <div className="chat-suggestions">
                    {(selectedPerson ? [
                      `What do we know about ${selectedPerson.displayName.split(" ")[0]}?`,
                      `${selectedPerson.displayName.split(" ")[0]} was born in …`,
                      `${selectedPerson.displayName.split(" ")[0]} had a sibling named …`,
                    ] : greeting?.suggestions?.length ? greeting.suggestions : [
                      "Who has the most descendants?",
                      "What do we know about Ramazan Darabi?",
                      "My cousin was born in Tehran in 1985 — record him",
                      "Which records are missing birth dates?",
                    ]).map((prompt) => <button type="button" className="chat-suggestion" key={prompt} onClick={() => { setInput(prompt); inputRef.current?.focus(); }}>{prompt}</button>)}
                  </div>}
                  {messages.map((message, index) => (
                    <div className={`chat-bubble ${message.role === "user" ? "is-user" : ""}`} key={`${message.role}-${index}`}>{message.role === "user" ? message.text : <Markdown text={message.text} />}</div>
                  ))}
                  {busy && <div className="chat-bubble"><span className="agent-pulse" /> {t("chat.thinking")}</div>}
                  {error && <p className="rounded-xl bg-[rgba(226,140,115,.12)] px-3 py-2 text-xs leading-5 text-[#e8a289]">{error}</p>}
                </div>
                <div className="pt-5">
                  {files.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{files.map((file) => <span className="file-chip" key={file.name}>{file.name}</span>)}</div>}
                  <div className="editor-composer rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.3)]">
                    {selectedPerson && <ComposerFocus person={selectedPerson} canEdit onClear={closePerson} />}
                    <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }} className="min-h-20 w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-[var(--muted)]" placeholder={selectedPerson ? t("chat.placeholderPerson", { name: selectedPerson.displayName.split(" ")[0] }) : t("chat.placeholder")} aria-label="Message the family archivist" />
                    <div className="mt-2 flex items-center justify-between">
                      <input ref={fileRef} className="sr-only" type="file" multiple onChange={(event) => { const incoming = Array.from(event.target.files ?? []); setFiles((current) => [...current, ...incoming.filter((file) => !current.some((existing) => `${existing.name}:${existing.size}` === `${file.name}:${file.size}`))]); event.target.value = ""; }} />
                      <input ref={(node) => { folderRef.current = node; node?.setAttribute("webkitdirectory", ""); node?.setAttribute("directory", ""); }} className="sr-only" type="file" multiple onChange={(event) => { const incoming = Array.from(event.target.files ?? []); setFiles((current) => [...current, ...incoming.filter((file) => !current.some((existing) => `${existing.name}:${existing.size}` === `${file.name}:${file.size}`))]); event.target.value = ""; }} />
                      <AttachMenu onFiles={() => fileRef.current?.click()} onFolder={() => folderRef.current?.click()} />
                      <button className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-fill)] text-white transition hover:bg-[#3a604a] disabled:opacity-40" disabled={busy || (!input.trim() && !files.length)} onClick={sendMessage} aria-label={t("chat.send")}>↑</button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="chat-resize-handle" onPointerDown={startChatResize} aria-hidden="true" />
        </aside>
        <button className={`chat-edge-reveal ${chatCollapsed ? "is-visible" : ""}`} onClick={() => setChatCollapsed(false)} aria-label={t("chat.reveal")} title={t("chat.reveal")}>›</button>
        {hoverPreview && viewMode === "family" && hoverPreview.id !== selectedPerson?.id && (
          // the hover preview IS the profile: the same panel a click opens,
          // rendered read-only and inert
          <div className="person-hover-preview" aria-hidden="true">
            <PersonModalV2 key={hoverPreview.id} person={hoverPreview} tree={tree} canEdit={false} onClose={() => {}} onSelect={() => {}} onTreeChange={() => {}} />
          </div>
        )}
        {!selectedPerson && placeFocus && viewMode === "map" && <PlacePanel place={placeFocus} tree={tree} onPick={(person) => openPerson(person, true, false)} onClose={() => setPlaceFocus(null)} />}
        {selectedPerson && <PersonModalV2 key={selectedPerson.id} person={selectedPerson} tree={tree} canEdit={viewer.canEdit} onClose={closePerson} onSelect={(person) => openPerson(person)} onTreeChange={(next) => { setTree(next); setSelectedPerson(next.people.find((candidate) => candidate.id === selectedPerson.id) ?? null); }} />}
        <section className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="absolute inset-0 tree-grid opacity-20" aria-hidden="true" />
          <div className="relative h-full min-h-0">

            <div className="relative h-full min-h-0 overflow-hidden stage-bg">
              {viewMode !== "timeline" && viewMode !== "map" && !treeLoaded && <div className="family-canvas" aria-busy="true" aria-label="Loading the family tree" />}
              {viewMode === "family" && treeLoaded && (focal ? <FocusFamilyView tree={tree} focusId={focal.id} selectedId={selectedPerson?.id ?? null} canBack canForward onBack={() => window.history.back()} onForward={() => window.history.forward()} onPick={(person) => openPerson(person)} onSelectOnly={(person) => openPerson(person, true, false)} onPreview={setHoverPreview} onOpen={(person) => openPerson(person)} /> : <EmptyTree canEdit={viewer.canEdit} />)}
              {viewMode === "list" && treeLoaded && <OutlineView tree={tree} onSelect={(person) => openPerson(person)} />}
              {viewMode === "fill" && viewer.canEdit && treeLoaded && <MissingDataView tree={tree} onSaved={setTree} onOpen={(person) => openPerson(person)} />}
              {viewMode === "tree" && treeLoaded && (tree.people.length ? <FamilyTreeCanvas tree={tree} highlightedIds={highlightedIds} focusPersonId={highlightedIds[0]} onSelect={(person) => openPerson(person)} /> : <EmptyTree canEdit={viewer.canEdit} />)}
              {viewMode === "timeline" && <TimelineView tree={tree} onSelect={(person) => { setHighlightedIds([person.id]); setSelectedPerson(person); }} />}
              {viewMode === "calendar" && treeLoaded && <CalendarView tree={tree} onSelect={(person) => openPerson(person)} />}
              {viewMode === "stats" && treeLoaded && <StatisticsView tree={tree} onSelect={(person) => openPerson(person)} />}
              {viewMode === "map" && <WorldMapView tree={tree} onSelectPlace={(place) => { setPlaceFocus(place); setSelectedPerson(null); setHighlightedIds(place.people.map((person) => person.id)); }} />}
            </div>
          </div>
        </section>

      </div>
      <span className="build-version" aria-label={`Darabiha version ${VERSION}`}>Version {VERSION}</span>
    </main>
  );
}

function InlineText({ value, placeholder, canEdit, multiline, className, inputType, onSave }: { value: string | null; placeholder: string; canEdit: boolean; multiline?: boolean; className?: string; inputType?: string; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (!canEdit) return value ? <span className={className}>{value}</span> : null;
  if (!editing) {
    return <button type="button" className={`inline-edit ${value ? "" : "is-empty"} ${className ?? ""}`} title="Click to edit" onClick={() => { setDraft(value ?? ""); setEditing(true); }}>{value || placeholder}</button>;
  }
  const commit = () => { setEditing(false); if (draft.trim() !== (value ?? "")) onSave(draft.trim()); };
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") setEditing(false);
    if (event.key === "Enter" && !multiline) (event.target as HTMLElement).blur();
  };
  return multiline
    ? <textarea className={`modal-input inline-input inline-input-multiline ${className ?? ""}`} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={keys} />
    : <input className={`modal-input inline-input ${className ?? ""}`} type={inputType ?? "text"} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={keys} />;
}

function LinkedText({ text, people, exceptId, onSelect }: { text: string; people: Person[]; exceptId: string; onSelect: (person: Person) => void }) {
  const nodes = useMemo(() => {
    const candidates = people
      .filter((person) => person.id !== exceptId && person.displayName.length >= 4)
      .sort((a, b) => b.displayName.length - a.displayName.length);
    const pattern = candidates.map((person) => person.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    if (!pattern) return [text];
    const regex = new RegExp(`(${pattern})`, "gi");
    const byLower = new Map(candidates.map((person) => [person.displayName.toLocaleLowerCase(), person]));
    return text.split(regex).map((part, index) => {
      const person = byLower.get(part.toLocaleLowerCase());
      if (person) return <button type="button" className="bio-link" key={index} onClick={() => onSelect(person)}>{part}</button>;
      return part;
    });
  }, [text, people, exceptId, onSelect]);
  return <>{nodes}</>;
}


/** The selection belongs to the input, not to the thread: a chip attached to
 * the top of the composer says whose record the next message goes to, and
 * clears in one click. */
function ComposerFocus({ person, canEdit, onClear }: { person: Person; canEdit: boolean; onClear: () => void }) {
  const { t } = useLanguage();
  const first = person.displayName.split(" ")[0];
  return <div className="composer-focus">
    <span className="composer-focus-chip">
      {person.photoAttachmentId ? <span className="ped-portrait ped-photo"><img src={`/api/photos/${person.photoAttachmentId}`} alt="" /></span> : <Silhouette gender={person.gender} />}
      <strong>{person.displayName}</strong>
      <button type="button" className="composer-focus-clear" onClick={onClear} aria-label={t("chat.clearFocus", { name: person.displayName })} title={t("chat.clearFocus", { name: person.displayName })}>×</button>
    </span>
    <span className="composer-focus-note">{canEdit
      ? t("chat.focusEditor", { name: first })
      : t("chat.focusViewer", { name: first })}</span>
  </div>;
}

/** One ＋ that offers the two kinds of attachment, Apple-menu style. */
function AttachMenu({ onFiles, onFolder }: { onFiles: () => void; onFolder: () => void }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  return <div className="attach-menu" ref={wrapRef}>
    <button type="button" className="composer-attach" aria-label={t("chat.attach")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>＋</button>
    {open && <div className="attach-popover" role="menu">
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onFiles(); }}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 2.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V6.5Z" /><path d="M12 2.5v4h3.5" /></svg>
        {t("chat.addFiles")}
      </button>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onFolder(); }}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.75 6.25V5a1.5 1.5 0 0 1 1.5-1.5h3l1.75 2h6.25a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4.25a1.5 1.5 0 0 1-1.5-1.5Z" /></svg>
        {t("chat.addFolder")}
      </button>
    </div>}
  </div>;
}

/** The Map panel: everyone the records place in a city, as preview cards.
 * Clicking a card opens the profile in the same slot; closing the profile
 * lands back on this list because the place focus survives it. */
function PlacePanel({ place, tree, onPick, onClose }: { place: MappedPlace; tree: FamilyTree; onPick: (person: Person) => void; onClose: () => void }) {
  const { t } = useLanguage();
  const roleIn = (person: Person) => {
    const norm = (value: string | null) => value?.toLocaleLowerCase() ?? "";
    const label = place.label.toLocaleLowerCase();
    const born = label.startsWith(norm(person.birthCity)) && Boolean(person.birthCity);
    const died = label.startsWith(norm(person.deathCity)) && Boolean(person.deathCity);
    if (born && died) return t("place.bornDiedHere");
    if (died) return t("place.diedHere");
    if (born) return t("place.bornHere");
    return ""; // mapped by country only - the dates say enough
  };
  const people = [...place.people].sort((a, b) => (Number(a.birthDate?.slice(0, 4)) || 9999) - (Number(b.birthDate?.slice(0, 4)) || 9999) || a.displayName.localeCompare(b.displayName));
  return <section className="person-modal person-modal-v2 person-panel place-panel" role="dialog" aria-labelledby="place-panel-title">
    <header className="person-panel-bar">
      <span aria-hidden="true" />
      <button type="button" className="person-nav-close" onClick={onClose} aria-label={t("person.close")}>×</button>
    </header>
    <div className="person-hero-copy">
      <h2 id="place-panel-title" className="font-serif text-4xl">{place.label}</h2>
      <p className="person-subtitle">{people.length === 1 ? t("place.onePerson") : t("place.people", { count: people.length })}</p>
    </div>
    <div className="place-people">
      {people.map((person) => {
        const born = person.birthDate?.slice(0, 4), died = person.deathDate?.slice(0, 4);
        const life = born && died ? `${born}–${died}` : born ? `b. ${born}` : died ? `d. ${died}` : "";
        return <button type="button" className="place-person-row" key={person.id} onClick={() => onPick(person)}>
          {person.photoAttachmentId ? <span className="ped-portrait ped-photo"><img src={`/api/photos/${person.photoAttachmentId}`} alt="" /></span> : <Silhouette gender={person.gender} />}
          <span className="place-person-copy">
            <strong>{person.displayName}</strong>
            <span>{[life, roleIn(person)].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="place-person-go" aria-hidden="true">›</span>
        </button>;
      })}
    </div>
  </section>;
}

/** The family talking to each other about a record. Any signed-in member may
 * leave one; you can delete your own, and an admin can delete any. */
function PersonComments({ personId }: { personId: string }) {
  const { t } = useLanguage();
  const [comments, setComments] = useState<FamilyNote[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/comments").then((response) => response.ok ? response.json() as Promise<{ comments: FamilyNote[]; me: string }> : null)
      .then((data) => { if (!cancelled && data) { setComments(data.comments); setMe(data.me); } })
      .catch(() => { /* signed-out visitors simply see no thread */ });
    return () => { cancelled = true; };
  }, []);
  if (comments === null) return null;
  const mine = comments.filter((comment) => comment.personId === personId);
  const send = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch("/api/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { comments?: FamilyNote[]; me?: string };
      if (data.comments) { setComments(data.comments); setMe(data.me ?? me); }
    } finally { setBusy(false); }
  };
  return <div className="person-comments">
    <div className="relationship-heading"><p className="eyebrow">{t("person.notes")}</p></div>
    {mine.length > 0 && <div className="comment-list">{mine.map((comment) => <div className="comment" key={comment.id}>
      <p className="comment-body">{comment.body}</p>
      <p className="comment-meta">{comment.authorName} · {new Date(comment.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        {me && <button type="button" className="comment-remove" onClick={() => send({ action: "remove", commentId: comment.id })} aria-label={t("person.deleteNote")}>×</button>}
      </p>
    </div>)}</div>}
    <div className="comment-compose">
      <textarea className="modal-input" value={draft} placeholder={t("person.notePlaceholder")} rows={2}
        onChange={(event) => setDraft(event.target.value)} aria-label="Add a note about this person" />
      <button type="button" className="fill-save" disabled={busy || !draft.trim()} onClick={async () => { await send({ personId, body: draft }); setDraft(""); }}>{t("person.postNote")}</button>
    </div>
  </div>;
}

function PersonModalV2({ person, tree, canEdit, onClose, onSelect, onTreeChange }: { person: Person; tree: FamilyTree; canEdit: boolean; onClose: () => void; onSelect: (person: Person) => void; onTreeChange: (tree: FamilyTree) => void }) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [relationEditor, setRelationEditor] = useState<string | null>(null);
  const [relativeQuery, setRelativeQuery] = useState("");
  const [relativeChoice, setRelativeChoice] = useState("");
  const [editingBio, setEditingBio] = useState(false);
  const [photoShare, setPhotoShare] = useState<string | null>(null);
  const [shareQuery, setShareQuery] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const buckets = relatedPeople(tree, person.id);
  const stories = tree.stories.filter((story) => story.personIds.includes(person.id));
  const photos = person.photoIds ?? (person.photoAttachmentId ? [person.photoAttachmentId] : []);
  async function post(body: Record<string, unknown>) { const response = await fetch("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json() as { tree?: FamilyTree; error?: string }; if (!response.ok || !data.tree) throw new Error(data.error || "Request failed"); onTreeChange(data.tree); return data.tree; }
  const patchField = (key: string) => async (value: string) => { try { await post({ action: "update", personId: person.id, patch: { [key]: value } }); setNotice("Saved"); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save"); } };
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
  // born within a plausible lifetime and no death recorded -> presumed living;
  // an ancestor born in 1856 with no death date is simply unrecorded
  const birthYear = Number(person.birthDate?.slice(0, 4));
  const presumedLiving = !person.deathDate && (!birthYear || new Date().getFullYear() - birthYear <= 110);
  const subtitleRest = [person.birthDate ? (person.deathDate ? `${person.birthDate.slice(0, 4)}–${person.deathDate.slice(0, 4)}` : `b. ${person.birthDate.slice(0, 4)}`) : person.deathDate ? `d. ${person.deathDate.slice(0, 4)}` : "", locationLine(person.birthCity, person.birthCountry, person.birthPlace) ?? ""].filter(Boolean).join(" · ");
  const relation = (other: Person, label: string) => tree.relationships.find((link) => (label === "Spouse" && link.type === "spouse" && ((link.fromPersonId === person.id && link.toPersonId === other.id) || (link.toPersonId === person.id && link.fromPersonId === other.id))) || (label === "Parents" && link.type === "parent" && link.fromPersonId === other.id && link.toPersonId === person.id) || (label === "Children" && link.type === "parent" && link.fromPersonId === person.id && link.toPersonId === other.id));
  return <section className="person-modal person-modal-v2 person-panel" role="dialog" aria-labelledby="person-modal-title">
    <header className="person-panel-bar">
      <div className="person-nav">
        <button type="button" onClick={() => window.history.back()} aria-label={t("person.previous")} title={t("person.previous")}>‹</button>
        <button type="button" onClick={() => window.history.forward()} aria-label={t("person.next")} title={t("person.next")}>›</button>
      </div>
      <button type="button" className="person-nav-close" onClick={onClose} aria-label={t("person.close")}>×</button>
    </header>
    <input ref={photoRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const body = new FormData(); body.set("personId", person.id); body.set("photo", file); const response = await fetch("/api/people", { method: "POST", body }); const data = await response.json() as { tree?: FamilyTree; error?: string }; if (response.ok && data.tree) { onTreeChange(data.tree); setNotice("Photo updated"); } else setNotice(data.error || "Could not upload photo"); event.target.value = ""; }} />
    <div className="person-modal-hero is-stacked">
      <div className="person-hero-copy">
        <h2 id="person-modal-title" className="font-serif text-4xl"><InlineText value={person.displayName} placeholder="Name" canEdit={canEdit} onSave={patchField("displayName")} /></h2>
        <p className="person-subtitle">
          {person.gender === "female" && (person.maidenName || canEdit) && <span className="person-maiden">{person.maidenName ? `${t("person.nee")} ` : ""}<InlineText value={person.maidenName} placeholder="add maiden name" canEdit={canEdit} onSave={patchField("maidenName")} />{subtitleRest ? " · " : ""}</span>}
          {subtitleRest}
        </p>
        <div className="person-gender-row">{(["female", "male"] as const).map((option) => <button key={option} type="button" className={`gender-pick ${person.gender === option ? "is-active" : ""}`} disabled={!canEdit} onClick={() => canEdit && patchField("gender")(person.gender === option ? "" : option)}>{option === "female" ? t("person.female") : t("person.male")}</button>)}</div>
      </div>
      {person.photoAttachmentId
        ? <button type="button" className="person-modal-photo-button" onClick={() => canEdit && photoRef.current?.click()} aria-label={canEdit ? "Change portrait" : "Portrait"} title={canEdit ? "Click to change the portrait" : undefined}><img className="person-modal-photo" src={`/api/photos/${person.photoAttachmentId}`} alt="" /></button>
        : canEdit && <button type="button" className="person-add-photo" onClick={() => photoRef.current?.click()}>＋ {t("person.addPhoto")}</button>}
    </div>
    <div className="person-facts">
      <div><span className="eyebrow">{t("person.born")}</span><p className="fact-line"><InlineText value={person.birthDate} placeholder="add date" canEdit={canEdit} onSave={patchField("birthDate")} className="fact-date" />{(canEdit || person.birthCity || person.birthCountry) && <> in <InlineText value={person.birthCity} placeholder="city" canEdit={canEdit} onSave={patchField("birthCity")} />{(canEdit || (person.birthCity && person.birthCountry)) && ", "}<InlineText value={person.birthCountry} placeholder="country" canEdit={canEdit} onSave={patchField("birthCountry")} /></>}{!canEdit && !person.birthDate && t("person.birthNotRecorded")}</p></div>
      {/* No death date does not mean "died, date unknown": someone born within a
          lifetime is presumed living, and the record only asks for a death once
          there is reason to think there was one. */}
      <div><span className="eyebrow">{person.deathDate ? t("person.died") : presumedLiving ? t("person.living") : t("person.death")}</span><p className="fact-line">
        {person.deathDate || !presumedLiving
          ? <><InlineText value={person.deathDate} placeholder={canEdit ? "add date" : ""} canEdit={canEdit} onSave={patchField("deathDate")} className="fact-date" />{(canEdit || person.deathCity || person.deathCountry) && <> in <InlineText value={person.deathCity} placeholder="city" canEdit={canEdit} onSave={patchField("deathCity")} />{(canEdit || (person.deathCity && person.deathCountry)) && ", "}<InlineText value={person.deathCountry} placeholder="country" canEdit={canEdit} onSave={patchField("deathCountry")} /></>}{!canEdit && !person.deathDate && t("person.notRecorded")}</>
          : canEdit
            ? <button type="button" className="inline-edit is-empty" onClick={() => patchField("deathDate")(new Date().toISOString().slice(0, 10))}>{t("person.recordDeath")}</button>
            : <>{t("person.stillLiving")}</>}
      </p></div>
      {(person.burialPlace || (canEdit && person.deathDate)) && <div className="person-fact-wide"><span className="eyebrow">{t("person.buried")}</span><p className="fact-line"><InlineText value={person.burialPlace} placeholder={t("person.burialPlaceholder")} canEdit={canEdit} onSave={patchField("burialPlace")} /></p></div>}
    </div>
    {(photos.length > 1 || (canEdit && photos.length > 0)) && <div className="person-photos">
      <div className="relationship-heading"><p className="eyebrow">{t("person.photographs")}</p>{canEdit && <button type="button" className="relationship-add" onClick={() => photoRef.current?.click()} aria-label="Add a photograph">＋</button>}</div>
      <div className="photo-grid">
        {photos.map((id) => <div className={`photo-tile ${id === person.photoAttachmentId ? "is-portrait" : ""}`} key={id}>
          <img src={`/api/photos/${id}`} alt="" loading="lazy" />
          {canEdit && <div className="photo-tile-actions">
            {id !== person.photoAttachmentId && <button type="button" onClick={async () => { try { await post({ action: "set_portrait", personId: person.id, attachmentId: id }); setNotice("Portrait set"); } catch { setNotice("Could not set the portrait"); } }}>{t("person.portrait")}</button>}
            <button type="button" onClick={() => setPhotoShare(id)}>{t("person.whoElse")}</button>
            <button type="button" className="is-danger" data-action="unlink" onClick={async () => { try { await post({ action: "unlink_photo", personId: person.id, attachmentId: id }); setNotice("Removed from this record"); } catch { setNotice("Could not remove the photograph"); } }}>{t("person.removePhoto")}</button>
          </div>}
          {id === person.photoAttachmentId && <span className="photo-tile-badge">{t("person.portrait")}</span>}
        </div>)}
      </div>
      {photoShare && <div className="relative-picker">
        <input className="modal-input" autoFocus value={shareQuery} placeholder={t("person.whoElsePrompt")} onChange={(event) => setShareQuery(event.target.value)} />
        {shareQuery.trim() && <div className="relative-suggestions">{tree.people.filter((candidate) => candidate.id !== person.id && !(candidate.photoIds ?? []).includes(photoShare) && candidate.displayName.toLocaleLowerCase().includes(shareQuery.trim().toLocaleLowerCase())).slice(0, 6).map((candidate) => <button type="button" key={candidate.id} onClick={async () => { try { await post({ action: "link_photo", personId: candidate.id, attachmentId: photoShare }); setNotice(`Added to ${candidate.displayName}`); setPhotoShare(null); setShareQuery(""); } catch { setNotice("Could not add them to the photograph"); } }}><strong>{candidate.displayName}</strong><span>{candidate.birthDate?.slice(0, 4) || "Year unknown"}</span></button>)}</div>}
        <button type="button" className="fill-skip" onClick={() => { setPhotoShare(null); setShareQuery(""); }}>{t("person.done")}</button>
      </div>}
    </div>}
    {(person.biography || canEdit) && <div className="person-biography-block">
      <div className="relationship-heading"><p className="eyebrow">{t("person.biography")}</p></div>
      {editingBio
        ? <InlineTextAlwaysOpen value={person.biography} onSave={async (value) => { await patchField("biography")(value); setEditingBio(false); }} onCancel={() => setEditingBio(false)} />
        : person.biography
          ? <p className={`person-biography ${canEdit ? "is-editable" : ""}`} title={canEdit ? "Click to edit the biography" : undefined} onClick={(event) => { if (!canEdit) return; if ((event.target as HTMLElement).closest(".bio-link")) return; setEditingBio(true); }}><LinkedText text={person.biography} people={tree.people} exceptId={person.id} onSelect={onSelect} /></p>
          : canEdit && <button type="button" className="inline-edit is-empty bio-add" onClick={() => setEditingBio(true)}>{t("person.addBiography")}</button>}
    </div>}
    {stories.length > 0 && <div className="person-stories">
      <div className="relationship-heading"><p className="eyebrow">{t("person.stories")}</p></div>
      {stories.map((story) => <details className="story-card" key={story.id}>
        <summary><span className="story-title">{story.title}</span>{story.date && <span className="story-year">{story.date.slice(0, 4)}</span>}</summary>
        <p className="story-body" dir="auto">{story.body}</p>
        <p className="story-source">From the family archive{story.place ? ` · ${story.place}` : ""}</p>
        {/* the family wrote these in Persian; the English above is a translation
            of those words, and dir=auto lets the original set its own direction */}
        {story.originalBody && <details className="story-original">
          <summary>{t("person.readOriginal")}</summary>
          <p className="story-body" dir="auto">{story.originalBody}</p>
        </details>}
      </details>)}
    </div>}
    <div className="modal-relationships">{([['Parents', buckets.parents], ['Spouse', buckets.spouses], ['Children', buckets.children], ['Siblings', buckets.siblings]] as [string, Person[]][]).filter(([, people]) => canEdit || people.length > 0).map(([label, people]) => <div className="relationship-group" key={label}><div className="relationship-heading"><p className="eyebrow">{t(`person.${label.toLocaleLowerCase()}`)}</p>{canEdit && <button type="button" className="relationship-add" onClick={() => { setRelationEditor(relationEditor === label ? null : label); setRelativeQuery(""); setRelativeChoice(""); }} aria-label={`Add ${label.toLocaleLowerCase()}`}>＋</button>}</div>{people.length > 0 && <div className="relationship-rows">{people.map((relative) => { const link = relation(relative, label); return <div className="relationship-row" key={relative.id}><button className="relationship-row-main" onClick={() => onSelect(relative)}><span className="rel-name">{relative.displayName}</span><span className="rel-meta">{[relative.birthDate?.slice(0, 4), label === "Spouse" ? link?.status ?? undefined : undefined].filter(Boolean).join(" · ")}</span></button>{label === "Spouse" && canEdit && link && <select className="marriage-status" value={link.status ?? ""} aria-label={`Marriage status with ${relative.displayName}`} onChange={async (event) => { try { await post({ action: "relationship_status", relationshipId: link.id, status: event.target.value || null }); setNotice("Marriage status saved"); } catch { setNotice("Could not save status"); } }}><option value="">married</option><option value="divorced">divorced</option><option value="widowed">widowed</option></select>}{canEdit && link && <button className="relationship-remove" onClick={() => removeRelationship(link.id)} aria-label={`Remove ${relative.displayName}`}>×</button>}</div>; })}</div>}{relationEditor === label && <div className="relative-picker"><input className="modal-input" value={relativeQuery} autoFocus placeholder={`Find or create a ${label.toLocaleLowerCase().replace(/s$/, "")}`} onChange={(event) => { setRelativeQuery(event.target.value); setRelativeChoice(""); }} />{relativeQuery.trim() && <div className="relative-suggestions">{tree.people.filter((candidate) => candidate.id !== person.id && candidate.displayName.toLocaleLowerCase().includes(relativeQuery.trim().toLocaleLowerCase())).slice(0, 6).map((candidate) => <button type="button" key={candidate.id} onClick={() => { setRelativeChoice(candidate.id); setRelativeQuery(candidate.displayName); }}><strong>{candidate.displayName}</strong><span>{candidate.birthDate?.slice(0, 4) || "Year unknown"}{locationLine(candidate.birthCity, candidate.birthCountry, candidate.birthPlace) ? ` · ${locationLine(candidate.birthCity, candidate.birthCountry, candidate.birthPlace)}` : ""}</span></button>)}</div>}<button type="button" className="relative-add-button" disabled={!relativeQuery.trim() || saving} onClick={() => addRelative(label)}>{relativeChoice ? "Add selected person" : "Use this name"}</button></div>}</div>)}</div>
    <PersonComments personId={person.id} />
    {notice && <p className="modal-notice" role="status">{notice}</p>}
    {canEdit && <div className="person-delete-footer">{person.photoAttachmentId && <button className="photo-remove-button" onClick={async () => { try { await post({ action: "remove_photo", personId: person.id }); setNotice("Photo removed"); } catch { setNotice("Could not remove photo"); } }}>{t("person.removePortrait")}</button>}<button className="person-delete-button" disabled={saving} onClick={deletePerson}>{t("person.delete")}</button></div>}
  </section>;
}

function InlineTextAlwaysOpen({ value, onSave, onCancel }: { value: string | null; onSave: (next: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value ?? "");
  return <div className="bio-editor">
    <textarea className="modal-input inline-input-multiline" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} />
    <div className="fill-actions"><button type="button" className="fill-save" onClick={() => onSave(draft.trim())}>Save</button><button type="button" className="fill-skip" onClick={onCancel}>Cancel</button></div>
  </div>;
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

function PublicArchiveChat({ signedIn, tree, focusPerson, onClearFocus, onPeopleMentioned, onOpenPerson }: { signedIn: boolean; tree: FamilyTree; focusPerson: Person | null; onClearFocus: () => void; onPeopleMentioned: (people: Person[]) => void; onOpenPerson: (person: Person) => void }) {
  const { t } = useLanguage();
  const [question, setQuestion] = useState("");
  const [greeting, setGreeting] = useState<{ fact: string | null; personId: string | null; suggestions: string[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/greeting").then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!cancelled && data) setGreeting(data as { fact: string | null; personId: string | null; suggestions: string[] }); })
      .catch(() => { /* the chat works without it */ });
    return () => { cancelled = true; };
  }, []);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<string[]>([]);
  async function ask() {
    const text = question.trim();
    if (!text || busy) return;
    setAsked((current) => [...current, text]);
    setQuestion("");
    setBusy(true); setReply("");
    const contextual = focusPerson ? `[We are currently viewing the record of ${focusPerson.displayName}. Unless another person is named, answer about this person.]\n${text}` : text;
    try { const response = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: contextual }) }); const data = await response.json() as { reply?: string; error?: string }; const answer = response.ok ? data.reply || "No answer recorded." : "The archivist could not answer right now."; setReply(answer); onPeopleMentioned(tree.people.filter((person) => answer.toLocaleLowerCase().includes(person.displayName.toLocaleLowerCase()))); } finally { setBusy(false); }
  }
  return (
    <div className="public-chat flex h-full min-h-0 w-full flex-col">
      <div className={`flex flex-1 flex-col items-center overflow-y-auto pb-5 text-center ${asked.length || focusPerson ? "justify-start" : "justify-center"}`}>
        {!asked.length && !focusPerson ? <><h3 className="mt-0 font-serif text-2xl">{t("chat.title")}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("chat.intro")}</p>{greeting?.fact && <button type="button" className="chat-fact" onClick={() => { const person = greeting.personId ? tree.people.find((candidate) => candidate.id === greeting.personId) : null; if (person) onOpenPerson(person); }} disabled={!greeting.personId}><span className="chat-fact-label">{t("chat.fromArchive")}</span><span>{greeting.fact}</span></button>}{greeting?.suggestions?.length ? <div className="chat-suggestions">{greeting.suggestions.map((prompt) => <button type="button" className="chat-suggestion" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div> : null}{signedIn && <p className="public-chat-note mt-5 text-xs leading-5 text-[var(--muted)]">You&apos;re signed in, but this Apple account isn&apos;t authorized to edit this family tree.</p>}</> : <div className="public-chat-thread w-full pt-4 text-left">{asked.map((message, index) => <div className="public-chat-user-bubble" key={`${message}-${index}`}>{message}</div>)}{busy && <p className="public-chat-syncing"><span className="agent-pulse" /> {t("chat.thinking")}</p>}{!busy && reply && <div className="public-chat-answer"><Markdown text={reply} /></div>}</div>}
      </div>
      <div>
        <div className="public-chat-composer editor-composer relative w-full rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.3)]">
          {focusPerson && <ComposerFocus person={focusPerson} canEdit={false} onClear={onClearFocus} />}
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(); } }} className="min-h-24 w-full resize-none bg-transparent px-2 py-1 pr-12 text-sm leading-6 outline-none placeholder:text-[var(--muted)]" placeholder={focusPerson ? t("chat.viewerPlaceholderPerson", { name: focusPerson.displayName.split(" ")[0] }) : t("chat.viewerPlaceholder")} aria-label="Search the family archive" />
          <button onClick={ask} disabled={busy || !question.trim()} className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-fill)] text-white transition hover:bg-[#3a604a] disabled:opacity-40" aria-label={t("chat.send")}>↑</button>
        </div>
      </div>
    </div>
  );
}
