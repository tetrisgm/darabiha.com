"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FamilyTree, OpenQuestion, Person } from "../../lib/types";
import { buildGenerations, buildRelationMaps, hiddenRelativeCount } from "../../lib/tree-layout";
import { useLanguage } from "./LanguageContext";

function years(person: Person | undefined) {
  if (!person) return "";
  const b = person.birthDate?.slice(0, 4);
  const d = person.deathDate?.slice(0, 4);
  if (b && d) return `${b}–${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return "";
}

/** Ancestry-style pedigree around a focal person: children stacked on the
 * left, the focal couple in the middle, parents and grandparents branching
 * to the right, with measured connector lines, gendered silhouettes, ghost
 * "add parent" slots, and a click popover offering Tree here / Profile. */
export function Silhouette({ gender }: { gender: Person["gender"] }) {
  return <span className={`ped-portrait ped-${gender ?? "unknown"}`} aria-hidden="true">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
  </span>;
}

/** Safari on macOS will not reliably draw native hand/grab cursors over
 * these cards (the documented pathology in docs/HANDOFF.md), so the stage
 * paints its own cursor layer exactly like the Tree canvas does. */
function PedCursor({ mode, cursorRef }: { mode: "grab" | "grabbing" | "pointer"; cursorRef: React.RefObject<HTMLSpanElement | null> }) {
  return <span ref={cursorRef} className="tree-custom-cursor" data-mode={mode} data-visible="false" aria-hidden="true">
    <svg viewBox="0 0 32 32" focusable="false">
      {mode === "pointer" ? <path d="M9.5 3.5a2 2 0 0 1 4 0v9.1l1.1-1.4a2.1 2.1 0 0 1 3.4 2.4l.6-.8a2.1 2.1 0 0 1 3.5 2.2l.4-.4a2 2 0 0 1 3.4 1.9l-1.4 7.2a6.5 6.5 0 0 1-6.4 5.3h-2.7a7 7 0 0 1-5.7-3L5.8 20a2.2 2.2 0 0 1 3.4-2.7l.3.3V3.5Z" /> : mode === "grabbing" ? <path d="M8.3 12.4a2.2 2.2 0 0 1 3.4-1.8 2.3 2.3 0 0 1 4.1-.9 2.3 2.3 0 0 1 4.2.7 2.2 2.2 0 0 1 3.8 1.5l1 6.1a8.5 8.5 0 0 1-8.4 9.9h-.8a8.5 8.5 0 0 1-8.3-6.8l-.9-4.4a2.2 2.2 0 0 1 1.9-4.3Z" /> : <path d="M7.8 13.8V8.1a2 2 0 0 1 4 0v4.1-6.4a2 2 0 0 1 4 0v6-7.1a2 2 0 0 1 4 0v7.6-5.1a2 2 0 0 1 4 0v10.4a10 10 0 0 1-10 10h-.4a8.4 8.4 0 0 1-7.7-5L3.9 18a2.2 2.2 0 0 1 3.9-2v-2.2Z" />}
    </svg>
  </span>;
}

export function FocusFamilyView({ tree, focusId, selectedId, onPick, onSelectOnly, onPreview, onBack, onForward, canBack, canForward, onOpen }: { tree: FamilyTree; focusId: string; selectedId?: string | null; onPick: (person: Person) => void; onSelectOnly: (person: Person) => void; onPreview: (person: Person | null) => void; onBack?: () => void; onForward?: () => void; canBack?: boolean; canForward?: boolean; onOpen: (person: Person) => void }) {
  const { t } = useLanguage();
  const maps = useMemo(() => buildRelationMaps(tree), [tree]);
  const containerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef(new Map<string, HTMLDivElement>());
  const [paths, setPaths] = useState<string[]>([]);
  // Hovering a card shows the board that clicking it would give. It holds
  // until the pointer leaves the stage - clearing it when the hovered card
  // moves out from under the pointer, which the new layout does, would flicker.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Where the pointer was when the current preview began. Swapping the board
  // slides a different card under a pointer that never moved, and mouseenter
  // fires for it - so without this the two boards trade places forever.
  const pointerAt = useRef({ x: 0, y: 0 });
  const previewAt = useRef<{ x: number; y: number } | null>(null);
  const activeId = previewId && maps.byId.has(previewId) ? previewId : focusId;
  useEffect(() => { previewAt.current = null; setPreviewId(null); }, [focusId]);
  const model = useMemo(() => {
    const focal = maps.byId.get(activeId) ?? tree.people[0];
    if (!focal) return null;
    const get = (id: string) => maps.byId.get(id);
    const parents = (maps.parentsOf.get(focal.id) ?? []).map(get).filter(Boolean) as Person[];
    const father = parents.find((parent) => parent.gender === "male") ?? parents[0];
    const mother = parents.find((parent) => parent !== father);
    const spouses = [...new Set(maps.spousesOf.get(focal.id) ?? [])].map(get).filter(Boolean) as Person[];
    const children = [...new Set(maps.childrenOf.get(focal.id) ?? [])].map(get).filter(Boolean) as Person[];
    children.sort((a, b) => (Number(a.birthDate?.slice(0, 4)) || 9999) - (Number(b.birthDate?.slice(0, 4)) || 9999) || a.displayName.localeCompare(b.displayName));
    const siblings = [...new Set(parents.flatMap((parent) => maps.childrenOf.get(parent.id) ?? []))].filter((id) => id !== focal.id).map(get).filter(Boolean) as Person[];
    const childGroups: { spouse: Person | undefined; kids: Person[] }[] = [];
    for (const child of children) {
      const other = (maps.parentsOf.get(child.id) ?? []).filter((id) => id !== focal.id).map(get).filter(Boolean)[0] as Person | undefined;
      const existing = childGroups.find((group) => group.spouse?.id === other?.id);
      if (existing) existing.kids.push(child);
      else childGroups.push({ spouse: other, kids: [child] });
    }
    const links: [string, string][] = [];
    for (const child of children) links.push([`child-${child.id}`, "focal"]);
    if (father) links.push(["focal", "p-father"]);
    if (mother) links.push(["focal", "p-mother"]);
    const grandSlots: { parentKey: string; person: Person | undefined; key: string; label: string }[] = [];
    for (const [parentKey, parent] of [["p-father", father], ["p-mother", mother]] as const) {
      if (!parent) continue;
      const grandparents = (maps.parentsOf.get(parent.id) ?? []).map(get).filter(Boolean) as Person[];
      const grandfather = grandparents.find((gp) => gp.gender === "male") ?? grandparents[0];
      const grandmother = grandparents.find((gp) => gp !== grandfather);
      grandSlots.push({ parentKey, person: grandfather, key: `${parentKey}-gf`, label: "family.addGrandfather" });
      grandSlots.push({ parentKey, person: grandmother, key: `${parentKey}-gm`, label: "family.addGrandmother" });
      if (grandfather) links.push([parentKey, `${parentKey}-gf`]);
      if (grandmother) links.push([parentKey, `${parentKey}-gm`]);
    }
    // One more generation on each side, so panning after a re-center always
    // has content to reveal: great-grandparents to the right, grandchildren
    // to the left (recorded people only, no ghost slots at this depth).
    const greatSlots: { person: Person; key: string }[] = [];
    for (const slot of grandSlots) {
      if (!slot.person) continue;
      const greats = (maps.parentsOf.get(slot.person.id) ?? []).map(get).filter(Boolean) as Person[];
      for (const great of greats) {
        const key = `${slot.key}-${great.id}`;
        greatSlots.push({ person: great, key });
        links.push([slot.key, key]);
      }
    }
    const grandkidGroups: { child: Person; kids: Person[] }[] = [];
    for (const child of children) {
      const kids = [...new Set(maps.childrenOf.get(child.id) ?? [])].map(get).filter(Boolean) as Person[];
      if (!kids.length) continue;
      kids.sort((a, b) => (Number(a.birthDate?.slice(0, 4)) || 9999) - (Number(b.birthDate?.slice(0, 4)) || 9999) || a.displayName.localeCompare(b.displayName));
      grandkidGroups.push({ child, kids });
      for (const kid of kids) links.push([`gc-${kid.id}`, `child-${child.id}`]);
    }
    return { focal, father, mother, spouses, children, siblings, childGroups, grandSlots, greatSlots, grandkidGroups, links };
  }, [maps, tree, activeId]);
  // The instruction is for the first few seconds only: it retires on its own,
  // and immediately once a person has been picked.
  const [hintExpired, setHintExpired] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setHintExpired(true), 5000);
    return () => clearTimeout(timer);
  }, []);
  const hintVisible = !hintExpired && !selectedId;
  const panRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef(new Map<string, HTMLDivElement>());
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [panMode, setPanMode] = useState<"idle" | "drag" | "glide">("idle");
  const dragRef = useRef<{ id: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const pedCursorRef = useRef<HTMLSpanElement>(null);
  const [cursorMode, setCursorMode] = useState<"grab" | "grabbing" | "pointer">("grab");
  const positionPedCursor = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") pointerAt.current = { x: event.clientX, y: event.clientY };
    const cursor = pedCursorRef.current;
    if (!cursor || event.pointerType === "touch") return;
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    cursor.dataset.visible = "true";
    const target = event.target as Element;
    setCursorMode(dragRef.current ? "grabbing" : target.closest?.("button, summary") ? "pointer" : "grab");
    // moving off the cards and onto open canvas gives the board back
    if (previewId && !dragRef.current && !target.closest?.(".ped-card")) { cancelHover(); endPreview(); }
  };
  const hidePedCursor = () => {
    if (pedCursorRef.current && !dragRef.current) pedCursorRef.current.dataset.visible = "false";
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPanMode("idle");
      setPan({ x: 0, y: 0 });
      // after the zero-pan layout paints, land the focal card on the stage center
      requestAnimationFrame(() => {
        const stage = containerRef.current;
        const focalCard = slotRefs.current.get("focal");
        if (!stage || !focalCard) return;
        const stageRect = stage.getBoundingClientRect();
        const cardRect = focalCard.getBoundingClientRect();
        setPan({
          x: (stageRect.left + stageRect.width / 2) - (cardRect.left + cardRect.width / 2),
          y: (stageRect.top + stageRect.height / 2) - (cardRect.top + cardRect.height / 2),
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId]);
  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, summary, select, input, a")) return;
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPanMode("drag");
    setCursorMode("grabbing");
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    positionPedCursor(event);
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
  };
  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setPanMode((mode) => (mode === "drag" ? "idle" : mode));
    setCursorMode((event.target as Element).closest?.("button, summary") ? "pointer" : "grab");
  };
  const wheelPan = (event: React.WheelEvent<HTMLDivElement>) => {
    setPanMode("idle");
    if (event.ctrlKey || event.metaKey) {
      setScale((current) => Math.max(0.4, Math.min(2, current * (event.deltaY > 0 ? 0.94 : 1.06))));
    } else {
      setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
    }
  };
  useEffect(() => {
    if (!selectedId || selectedId === focusId) return;
    const frame = requestAnimationFrame(() => {
      const stage = containerRef.current;
      const slot = slotRefs.current.get(`spouse-${selectedId}`) ?? [...slotRefs.current.entries()].find(([key]) => key.endsWith(selectedId))?.[1];
      if (!stage || !slot) return;
      const stageRect = stage.getBoundingClientRect();
      const slotRect = slot.getBoundingClientRect();
      setPanMode("glide");
      setPan((current) => ({
        x: current.x + (stageRect.left + stageRect.width / 2) - (slotRect.left + slotRect.width / 2),
        y: current.y + (stageRect.top + stageRect.height / 2) - (slotRect.top + slotRect.height / 2),
      }));
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, focusId]);
  // Figma-style zoom: +/- (and cmd/ctrl with =/-) while the Family view is open
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const modified = event.metaKey || event.ctrlKey;
      if (event.key === "+" || (modified && event.key === "=")) {
        event.preventDefault();
        setScale((current) => Math.min(2, current * 1.1));
      } else if (event.key === "-") {
        event.preventDefault();
        setScale((current) => Math.max(0.4, current * 0.9));
      } else if (modified && event.key === "0") {
        event.preventDefault();
        setScale(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const centerColumn = (key: string) => {
    const column = colRefs.current.get(key);
    const stage = containerRef.current;
    if (!column || !stage) return;
    const stageRect = stage.getBoundingClientRect();
    const colRect = column.getBoundingClientRect();
    setPanMode("glide");
    setPan((current) => ({
      x: current.x + (stageRect.left + stageRect.width / 2) - (colRect.left + colRect.width / 2),
      y: current.y,
    }));
  };
  useLayoutEffect(() => {
    const container = panRef.current;
    if (!container || !model) return;
    const draw = () => {
      const base = container.getBoundingClientRect();
      const next: string[] = [];
      for (const [fromKey, toKey] of model.links) {
        const from = slotRefs.current.get(fromKey)?.getBoundingClientRect();
        const to = slotRefs.current.get(toKey)?.getBoundingClientRect();
        if (!from || !to) continue;
        const x0 = (from.right - base.left) / scale, y0 = (from.top + from.height / 2 - base.top) / scale;
        const x1 = (to.left - base.left) / scale, y1 = (to.top + to.height / 2 - base.top) / scale;
        const mid = (x0 + x1) / 2;
        next.push(`M ${x0} ${y0} L ${mid} ${y0} L ${mid} ${y1} L ${x1} ${y1}`);
      }
      setPaths(next);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [model, scale]);
  if (!model) return null;
  const { focal, father, mother, spouses, children, siblings, childGroups, grandSlots, greatSlots, grandkidGroups } = model;
  // who is already drawn, so a card's count means "more than you can see"
  const onBoard = new Set<string>([focal.id, father?.id, mother?.id,
    ...spouses.map((person) => person.id), ...children.map((person) => person.id), ...siblings.map((person) => person.id),
    ...grandSlots.map((slot) => slot.person?.id), ...greatSlots.map((slot) => slot.person.id),
    ...grandkidGroups.flatMap((group) => group.kids.map((kid) => kid.id))].filter(Boolean) as string[]);
  const statusOf = (spouse: Person) => maps.spouseStatus.get([focal.id, spouse.id].sort().join("|")) ?? null;
  const setRef = (key: string) => (element: HTMLDivElement | null) => {
    if (element) slotRefs.current.set(key, element);
    else slotRefs.current.delete(key);
  };
  const beginHover = (person: Person, viaPointer = true) => {
    onPreview(person);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const anchor = previewAt.current;
    const chosen = !viaPointer || !anchor || Math.hypot(pointerAt.current.x - anchor.x, pointerAt.current.y - anchor.y) > 6;
    if (person.id === activeId || !chosen) return;
    hoverTimer.current = setTimeout(() => {
      previewAt.current = { ...pointerAt.current };
      setPreviewId(person.id);
    }, 340);
  };
  const cancelHover = () => {
    onPreview(null);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  const endPreview = () => { previewAt.current = null; setPreviewId(null); };
  /* Swapping the board removes the card under the pointer, and React reports
     that as the pointer leaving the whole stage - four milliseconds after the
     preview opened, which closed it again. Only a pointer that is really
     outside the stage has left it. */
  const leaveStage = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX > rect.left && event.clientX < rect.right && event.clientY > rect.top && event.clientY < rect.bottom) return;
    hidePedCursor();
    cancelHover();
    endPreview();
  };
  const commit = (person: Person, keepLayout: boolean) => {
    cancelHover();
    endPreview();
    if (keepLayout) onSelectOnly(person); else onPick(person);
  };
  const card = (person: Person, key: string, subtitle?: string) => {
    const meta = [years(person), subtitle].filter(Boolean).join(" · ");
    // Only the person already at the centre keeps the layout - the tree is
    // already theirs, so a click just moves the selection. Everyone else,
    // spouses included, becomes the new centre: clicking a wife should show
    // HER parents and siblings, not her husband's.
    const keepLayout = person.id === focal.id;
    const behind = hiddenRelativeCount(person.id, maps, onBoard);
    return <div ref={setRef(key)} className={`ped-card ped-card-md ${person.id === (selectedId ?? focal.id) ? "is-selected" : ""}`} key={key}>
      <button type="button" onClick={() => commit(person, keepLayout)}
        onMouseEnter={() => beginHover(person)} onMouseLeave={cancelHover} onFocus={() => beginHover(person, false)} onBlur={cancelHover}>
        {person.photoAttachmentId ? <span className="ped-portrait ped-photo"><img src={`/api/photos/${person.photoAttachmentId}`} alt="" /></span> : <Silhouette gender={person.gender} />}
        <span className="ped-copy">
          <strong>{person.displayName}</strong>
          {meta && <span>{meta}</span>}
        </span>
        {behind > 0 && <span className="ped-more" title={t("family.moreRelatives").replace("{n}", String(behind))} aria-label={t("family.moreRelatives").replace("{n}", String(behind))}>+{behind}</span>}
      </button>
    </div>;
  };
  const ghost = (label: string, key: string, target: Person = focal) =>
    <div ref={setRef(key)} className="ped-card ped-card-sm ped-ghost" key={key}>
      <button type="button" onClick={() => onOpen(target)} title="Open the record to add this relative">＋ {label}</button>
    </div>;
  return <section className="focus-view ped-view" aria-label="Family around one person" data-preview={previewId ? "true" : "false"}>
    <div className="focus-toolbar">
      <div className="focus-nav">
        <button type="button" className="focus-back" onClick={onBack} disabled={!canBack} aria-label={t("family.back")}>←</button>
        <button type="button" className="focus-back" onClick={onForward} disabled={!canForward} aria-label={t("family.forward")}>→</button>
      </div>
      <p className="focus-hint" data-visible={hintVisible && !previewId ? "true" : "false"} aria-hidden={!hintVisible || Boolean(previewId)}>{t("family.hint")}</p>
      {previewId && <p className="focus-preview-note">{t("family.previewing").replace("{name}", focal.displayName)}</p>}
    </div>
    <div className="canvas-controls ped-zoom" role="group" aria-label="Family zoom controls">
      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setScale((current) => Math.max(0.4, current * 0.9))} aria-label="Zoom out" title="Zoom out">−</button>
      <button type="button" className="canvas-zoom-level" onPointerDown={(event) => event.stopPropagation()} onClick={() => setScale(1)} aria-label="Reset zoom" title="Reset zoom">{Math.round(scale * 100)}%</button>
      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setScale((current) => Math.min(2, current * 1.1))} aria-label="Zoom in" title="Zoom in">＋</button>
    </div>
    <div className="ped-stage" ref={containerRef} data-custom-cursor="true" data-panning={panMode === "drag" ? "true" : "false"}
      onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onWheel={wheelPan}
      onPointerEnter={positionPedCursor} onPointerLeave={leaveStage}>
      <PedCursor mode={cursorMode} cursorRef={pedCursorRef} />
      <div className={`ped-pan ${panMode === "glide" ? "is-glide" : ""}`} ref={panRef} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
        <svg className="ped-lines" aria-hidden="true">{paths.map((d, index) => <path key={index} d={d} />)}</svg>
        <div className="ped-columns" key={focal.id}>
          {grandkidGroups.length > 0 && <div className="ped-col ped-col-grandkids" ref={(element) => { if (element) colRefs.current.set("grandkids", element); else colRefs.current.delete("grandkids"); }}>
            <div className="ped-col-body">
              <button type="button" className="ped-col-label" onClick={() => centerColumn("grandkids")}>{t("family.grandchildren")}</button>
              {grandkidGroups.map((group) => <div className="ped-group" key={group.child.id}>
                {grandkidGroups.length > 1 && <p className="ped-group-label">via {group.child.displayName}</p>}
                {group.kids.map((kid) => card(kid, `gc-${kid.id}`))}
              </div>)}
            </div>
          </div>}
          <div className="ped-col ped-col-children" ref={(element) => { if (element) colRefs.current.set("children", element); else colRefs.current.delete("children"); }}>
            <div className="ped-col-body">
              <button type="button" className="ped-col-label" onClick={() => centerColumn("children")}>{t("family.children")}</button>
              {children.length === 0 && <p className="ped-none">{t("family.none")}</p>}
              {childGroups.map((group, index) => <div className="ped-group" key={index}>
                {(childGroups.length > 1 || spouses.length > 1) && <p className="ped-group-label">with {group.spouse?.displayName ?? "unrecorded partner"}</p>}
                {group.kids.map((child) => card(child, `child-${child.id}`))}
              </div>)}
            </div>
          </div>
          <div className="ped-col ped-col-focal" ref={(element) => { if (element) colRefs.current.set("focal", element); else colRefs.current.delete("focal"); }}>
            {/* The spouse and the siblings hang off the focal card rather than
                sitting in the column's flow, so the card - not the card plus
                everyone stacked under it - is what the column centres. That is
                what puts the children directly across from the person. */}
            <div className="ped-couple">
              {card(focal, "focal")}
              <div className="ped-focal-below">
                {spouses.map((spouse) => <div className="ped-spouse" key={spouse.id}><span className="ped-marriage">⚭</span>{card(spouse, `spouse-${spouse.id}`, statusOf(spouse) ?? undefined)}</div>)}
                {siblings.length > 0 && <details className="ped-siblings" open>
                  <summary>{t("family.siblings")} ({siblings.length})</summary>
                  {siblings.map((sibling) => card(sibling, `sib-${sibling.id}`))}
                </details>}
              </div>
            </div>
          </div>
          <div className="ped-col ped-col-parents" ref={(element) => { if (element) colRefs.current.set("parents", element); else colRefs.current.delete("parents"); }}>
            <div className="ped-col-body">
              <button type="button" className="ped-col-label" onClick={() => centerColumn("parents")}>{t("family.parents")}</button>
              {father ? card(father, "p-father") : ghost(t("family.addFather"), "p-father")}
              {mother ? card(mother, "p-mother") : ghost(t("family.addMother"), "p-mother")}
            </div>
          </div>
          <div className="ped-col ped-col-grand" ref={(element) => { if (element) colRefs.current.set("grand", element); else colRefs.current.delete("grand"); }}>
            <div className="ped-col-body">
              <button type="button" className="ped-col-label" onClick={() => centerColumn("grand")}>{t("family.grandparents")}</button>
              {grandSlots.length === 0 && <p className="ped-none">—</p>}
              {grandSlots.map((slot) => <div className="ped-grand-slot" key={slot.key}>
                {slot.person ? card(slot.person, slot.key) : ghost(t(slot.label), slot.key, slot.parentKey === "p-father" ? father : mother)}
              </div>)}
            </div>
          </div>
          {greatSlots.length > 0 && <div className="ped-col ped-col-great" ref={(element) => { if (element) colRefs.current.set("great", element); else colRefs.current.delete("great"); }}>
            <div className="ped-col-body">
              <button type="button" className="ped-col-label" onClick={() => centerColumn("great")}>{t("family.greatGrandparents")}</button>
              {greatSlots.map((slot) => card(slot.person, slot.key))}
            </div>
          </div>}
        </div>
      </div>
    </div>
  </section>;
}

function buildDescentModel(tree: FamilyTree) {
  const maps = buildRelationMaps(tree);
  const lineage = new Map(tree.people.map((person) => [person.id, 0]));
  for (let pass = 0; pass < tree.people.length; pass += 1) {
    for (const [child, parents] of maps.parentsOf) {
      for (const parent of parents) lineage.set(child, Math.max(lineage.get(child) ?? 0, (lineage.get(parent) ?? 0) + 1));
    }
  }
  const primary = new Map<string, string>();
  for (const [child, parents] of maps.parentsOf) {
    const best = [...parents].sort((a, b) => (lineage.get(b) ?? 0) - (lineage.get(a) ?? 0) || (maps.byId.get(a)?.displayName ?? "").localeCompare(maps.byId.get(b)?.displayName ?? ""))[0];
    primary.set(child, best);
  }
  const kidsOf = new Map<string, string[]>();
  for (const [child, parent] of primary) kidsOf.set(parent, [...(kidsOf.get(parent) ?? []), child]);
  for (const kids of kidsOf.values()) {
    kids.sort((a, b) => (Number(maps.byId.get(a)?.birthDate?.slice(0, 4)) || 9999) - (Number(maps.byId.get(b)?.birthDate?.slice(0, 4)) || 9999) || (maps.byId.get(a)?.displayName ?? "").localeCompare(maps.byId.get(b)?.displayName ?? ""));
  }
  return { maps, primary, kidsOf };
}

/** The whole family as a collapsible indented outline. */
export function OutlineView({ tree, onSelect }: { tree: FamilyTree; onSelect: (person: Person) => void }) {
  const model = useMemo(() => {
    const { maps, kidsOf } = buildDescentModel(tree);
    const placedAsSpouse = new Set<string>();
    for (const person of tree.people) {
      if (maps.parentsOf.has(person.id)) continue;
      const partner = (maps.spousesOf.get(person.id) ?? []).find((id) => maps.parentsOf.has(id) || kidsOf.has(id));
      if (partner) placedAsSpouse.add(person.id);
    }
    const roots = tree.people
      .filter((person) => !maps.parentsOf.has(person.id) && !placedAsSpouse.has(person.id))
      .sort((a, b) => (kidsOf.get(b.id)?.length ?? 0) - (kidsOf.get(a.id)?.length ?? 0) || a.displayName.localeCompare(b.displayName));
    return { maps, kidsOf, roots };
  }, [tree]);
  const { maps, kidsOf, roots } = model;
  const renderPerson = (person: Person, depth: number, seen: Set<string>): React.ReactNode => {
    if (seen.has(person.id)) return null;
    seen.add(person.id);
    const spouses = [...new Set(maps.spousesOf.get(person.id) ?? [])].map((id) => maps.byId.get(id)).filter(Boolean) as Person[];
    const kids = (kidsOf.get(person.id) ?? []).map((id) => maps.byId.get(id)).filter(Boolean) as Person[];
    kids.sort((a, b) => (Number(a.birthDate?.slice(0, 4)) || 9999) - (Number(b.birthDate?.slice(0, 4)) || 9999) || a.displayName.localeCompare(b.displayName));
    const line = <span className="outline-line">
      <button type="button" className="outline-name" onClick={() => onSelect(person)}>{person.displayName}</button>
      {years(person) && <span className="outline-years">{years(person)}</span>}
      {spouses.map((spouse) => <span className="outline-spouse" key={spouse.id}>⚭ <button type="button" onClick={() => onSelect(spouse)}>{spouse.displayName}</button>{years(spouse) ? ` ${years(spouse)}` : ""}</span>)}
    </span>;
    if (!kids.length) return <div className="outline-leaf" key={person.id}>{line}</div>;
    return <details key={person.id} open>
      <summary>{line}</summary>
      <div className="outline-kids">{kids.map((kid) => renderPerson(kid, depth + 1, seen))}</div>
    </details>;
  };
  const seen = new Set<string>();
  return <section className="outline-view" aria-label="Family list">
    {roots.map((root) => renderPerson(root, 0, seen))}
  </section>;
}

/** Type-ahead person search shared by every view. */
export function TreeSearch({ tree, onPick }: { tree: FamilyTree; onPick: (person: Person) => void }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    return tree.people
      .filter((person) => person.displayName.toLocaleLowerCase().includes(needle))
      .sort((a, b) => {
        const aStarts = a.displayName.toLocaleLowerCase().startsWith(needle) ? 0 : 1;
        const bStarts = b.displayName.toLocaleLowerCase().startsWith(needle) ? 0 : 1;
        return aStarts - bStarts || a.displayName.localeCompare(b.displayName);
      })
      .slice(0, 8);
  }, [tree, query]);
  const pick = (person: Person) => {
    setQuery("");
    setOpen(false);
    onPick(person);
  };
  return <div className="tree-search" ref={boxRef}>
    <input
      type="search"
      placeholder={t("nav.search")}
      value={query}
      autoComplete="off"
      aria-label={t("nav.search")}
      onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
      onFocus={() => setOpen(true)}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) pick(matches[0]); if (event.key === "Escape") { setQuery(""); setOpen(false); } }}
    />
    {open && matches.length > 0 && <div className="tree-search-results">
      {matches.map((person) => <button type="button" key={person.id} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(person)}>
        <strong>{person.displayName}</strong><span>{years(person) || "dates unknown"}</span>
      </button>)}
    </div>}
  </div>;
}

/** Every incomplete record as a browsable, searchable list of cards; click
 * one to fill its missing details in place. */
type FillSortKey = "first" | "last" | "birth" | "generation" | "missing";

/** "First name" is everything except the family name, which is the final
 * token that is not a parenthesized alias or archive marker. Single-token
 * names have no family name and sort last. */
function fillNameParts(person: Person) {
  const tokens = person.displayName.trim().split(/\s+/);
  let lastIndex = -1;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (!/^\(.*\)$/.test(tokens[index])) { lastIndex = index; break; }
  }
  if (tokens.length < 2 || lastIndex <= 0) return { first: tokens.join(" "), last: "" };
  return { first: tokens.filter((_, index) => index !== lastIndex).join(" "), last: tokens[lastIndex] };
}

function fillBirthYear(person: Person) {
  const match = (person.birthDate ?? "").match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

/** The archive's open questions, queued for the family to settle. Each one
 * carries its evidence and a prepared change; Confirm applies it on the spot,
 * "Not correct" closes it for good. A question about an unnamed person asks
 * for the name instead of a yes. */
function OpenQuestionsCard({ onTreeChange }: { onTreeChange: (tree: FamilyTree) => void }) {
  const { t } = useLanguage();
  const [questions, setQuestions] = useState<OpenQuestion[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/questions")
      .then((response) => response.ok ? response.json() as Promise<{ questions: OpenQuestion[] }> : { questions: [] })
      .then((data) => { if (!cancelled) setQuestions(data.questions); })
      .catch(() => { if (!cancelled) setQuestions([]); });
    return () => { cancelled = true; };
  }, []);
  const answer = async (question: OpenQuestion, verdict: "confirm" | "deny") => {
    setBusyId(question.id); setNotice("");
    try {
      const response = await fetch("/api/questions", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: question.id, verdict, note: notes[question.id]?.trim() || undefined }) });
      const data = await response.json() as { tree?: FamilyTree; questions?: OpenQuestion[]; error?: string };
      if (!response.ok) throw new Error(data.error || "answer_failed");
      if (data.questions) setQuestions(data.questions);
      if (data.tree) onTreeChange(data.tree);
      setNotice(verdict === "confirm" ? "Recorded — thank you." : "Noted as not correct.");
    } catch (error) {
      setNotice(error instanceof Error && error.message === "answer_name_required" ? "Please write the name first." : "Could not save the answer. Please try again.");
    } finally { setBusyId(null); }
  };
  if (!questions?.length) return notice ? <p className="fill-notice">{notice}</p> : null;
  return <div className="fill-questions">
    <div className="fill-questions-head">
      <h3>{t("fill.questionsTitle")}</h3>
      <p>{t("fill.questionsIntro")}</p>
      {notice && <p className="fill-questions-notice" role="status">{notice}</p>}
    </div>
    {questions.map((question) => {
      // a yes/no question is answered by pressing yes, never by typing it
      const choices = question.choices?.length
        ? question.choices
        : [{ label: question.needsAnswerText ? t("fill.recordName") : t("fill.confirm"), verdict: "confirm" as const },
           { label: question.needsAnswerText ? t("fill.notKnown") : t("fill.deny"), verdict: "deny" as const }];
      const needsNote = question.needsAnswerText;
      return <div className="fill-question" key={question.id}>
        <p className="fill-question-text">{question.question}</p>
        {question.imageId && <a className="fill-question-photo" href={`/api/photos/${question.imageId}`} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- archive evidence served from R2 */}
          <img src={`/api/photos/${question.imageId}`} alt="The photograph this question is about" loading="lazy" />
        </a>}
        {question.evidence && <p className="fill-question-evidence">{question.evidence}</p>}
        {question.actionSummary && <p className="fill-question-action">{question.actionSummary}</p>}
        <div className="fill-question-answer">
          <input className="fill-input" value={notes[question.id] ?? ""} placeholder={needsNote ? t("fill.namePlaceholder") : t("fill.notePlaceholder")}
            onChange={(event) => setNotes((current) => ({ ...current, [question.id]: event.target.value }))} aria-label={`Answer for: ${question.question}`} />
          <div className="fill-question-choices">
            {choices.map((choice) => <button type="button" key={choice.label}
              className={choice.verdict === "confirm" ? "fill-save" : "fill-skip"}
              disabled={busyId !== null || (needsNote && choice.verdict === "confirm" && !notes[question.id]?.trim())}
              onClick={() => answer(question, choice.verdict)}>{choice.label}</button>)}
          </div>
        </div>
      </div>;
    })}
  </div>;
}

export function MissingDataView({ tree, onSaved, onOpen }: { tree: FamilyTree; onSaved: (tree: FamilyTree) => void; onOpen: (person: Person) => void }) {
  const { t } = useLanguage();
  const maps = useMemo(() => buildRelationMaps(tree), [tree]);
  // Spouse-aware rows: a married-in relative with no recorded parents stands
  // on their spouse's generation, not on the founders' row.
  const generationOf = useMemo(() => buildGenerations(tree).depth, [tree]);
  const [sortKey, setSortKey] = useState<FillSortKey>("last");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [genFilter, setGenFilter] = useState("");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const seedForm = (person: Person) => setForm({
    displayName: person.displayName,
    gender: person.gender ?? "",
    birthDate: person.birthDate ?? "",
    deathDate: person.deathDate ?? "",
    birthCity: person.birthCity ?? "",
    birthCountry: person.birthCountry ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const missingOf = (person: Person) => {
    const missing: string[] = [];
    if (!person.gender) missing.push("gender");
    if (!person.birthDate) missing.push("birth date");
    if (!person.birthCity && !person.birthCountry && !person.birthPlace) missing.push("birth place");
    if (!person.photoAttachmentId) missing.push("photo");
    return missing;
  };
  const nameOrder = (a: Person, b: Person) => {
    const na = fillNameParts(a), nb = fillNameParts(b);
    return na.last.localeCompare(nb.last) || na.first.localeCompare(nb.first);
  };
  const compare = (a: Person, b: Person): number => {
    if (sortKey === "birth") {
      const ya = fillBirthYear(a), yb = fillBirthYear(b);
      // unknown years sink to the bottom in either direction
      if (ya === null || yb === null) return ya === yb ? nameOrder(a, b) : ya === null ? 1 : -1;
      return (ya - yb) * sortDir || nameOrder(a, b);
    }
    if (sortKey === "generation") return ((generationOf.get(a.id) ?? 0) - (generationOf.get(b.id) ?? 0)) * sortDir || nameOrder(a, b);
    if (sortKey === "missing") return (missingOf(a).length - missingOf(b).length) * sortDir || nameOrder(a, b);
    const na = fillNameParts(a), nb = fillNameParts(b);
    if (sortKey === "first") return na.first.localeCompare(nb.first) * sortDir || na.last.localeCompare(nb.last);
    if (!na.last !== !nb.last) return na.last ? -1 : 1;
    return na.last.localeCompare(nb.last) * sortDir || na.first.localeCompare(nb.first);
  };
  const incomplete = tree.people.filter((person) => missingOf(person).length > 0).sort(compare);
  const generations = [...new Set(incomplete.map((person) => generationOf.get(person.id) ?? 0))].sort((a, b) => a - b);
  const needle = query.trim().toLocaleLowerCase();
  const visible = incomplete.filter((person) =>
    (!needle || person.displayName.toLocaleLowerCase().includes(needle)) &&
    (genFilter === "" || String(generationOf.get(person.id) ?? 0) === genFilter));
  const complete = tree.people.length - incomplete.length;
  const context = (person: Person) => {
    const parents = (maps.parentsOf.get(person.id) ?? []).map((id) => maps.byId.get(id)?.displayName).filter(Boolean);
    const spouses = [...new Set(maps.spousesOf.get(person.id) ?? [])].map((id) => maps.byId.get(id)?.displayName).filter(Boolean);
    const parts = [];
    if (parents.length) parts.push(`child of ${parents.join(" and ")}`);
    if (spouses.length) parts.push(`married to ${spouses.join(", ")}`);
    return parts.join(" · ") || "no recorded relatives";
  };
  const save = async (person: Person) => {
    const current: Record<string, string> = {
      displayName: person.displayName,
      gender: person.gender ?? "",
      birthDate: person.birthDate ?? "",
      deathDate: person.deathDate ?? "",
      birthCity: person.birthCity ?? "",
      birthCountry: person.birthCountry ?? "",
    };
    const patch: Record<string, string> = {};
    for (const key of Object.keys(current)) {
      const next = (form[key] ?? "").trim();
      if (next !== current[key] && !(key === "displayName" && !next)) patch[key] = next;
    }
    if (!Object.keys(patch).length) { setExpandedId(null); return; }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", personId: person.id, patch }) });
      const data = await response.json() as { tree?: FamilyTree };
      if (!response.ok || !data.tree) throw new Error("save_failed");
      onSaved(data.tree);
      setForm({});
      setExpandedId(null);
      setNotice(`Saved ${person.displayName}.`);
    } catch {
      setNotice("Could not save — please try again.");
    } finally {
      setBusy(false);
    }
  };
  const field = (key: string, placeholder: string) =>
    <input className="fill-input" value={form[key] ?? ""} placeholder={placeholder} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />;
  return <section className="fill-view" aria-label="Fill in missing details">
    <OpenQuestionsCard onTreeChange={onSaved} />
    <div className="fill-progress">
      <strong>{complete}</strong> of {tree.people.length} records are complete · <strong>{incomplete.length}</strong> with gaps
      {notice && <span className="fill-notice"> · {notice}</span>}
    </div>
    <div className="fill-controls">
      <input className="fill-search" type="search" placeholder={t("fill.search")} value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Find a person to fill in" />
      <select className="fill-gen-filter" value={genFilter} onChange={(event) => setGenFilter(event.target.value)} aria-label="Filter by generation">
        <option value="">{t("fill.allGenerations")}</option>
        {generations.map((generation) => <option key={generation} value={String(generation)}>Generation {generation + 1}{generation === 0 ? " · eldest" : ""}</option>)}
      </select>
    </div>
    <div className="fill-table-head" aria-hidden="true">
      <span />
      {([["first", "First name"], ["last", "Last name"], ["birth", "Born"], ["generation", "Gen"], ["missing", "Missing"]] as [FillSortKey, string][]).map(([key, label]) =>
        <button type="button" key={key} className={`fill-th fill-th-${key} ${sortKey === key ? "is-active" : ""}`}
          onClick={() => { if (sortKey === key) setSortDir(sortDir === 1 ? -1 : 1); else { setSortKey(key); setSortDir(1); } }}>
          {label}{sortKey === key && <span className="fill-th-dir">{sortDir === 1 ? "▲" : "▼"}</span>}
        </button>)}
    </div>
    <div className="fill-list">
      {visible.length === 0 && <p className="fill-done">No matching incomplete records{needle || genFilter ? " — try another name or generation" : ". Everything is filled in!"}</p>}
      {visible.map((person, index) => {
        const open = expandedId === person.id;
        const generation = generationOf.get(person.id) ?? 0;
        const previous = index > 0 ? generationOf.get(visible[index - 1].id) ?? 0 : null;
        const name = fillNameParts(person);
        return <Fragment key={person.id}>
        {sortKey === "generation" && generation !== previous && <p className="fill-gen-head">Generation {generation + 1}{generation === 0 ? " · eldest" : ""}</p>}
        <div className={`fill-row ${open ? "is-open" : ""}`}>
          <button type="button" className="fill-row-head" onClick={() => { setExpandedId(open ? null : person.id); if (!open) seedForm(person); setNotice(""); }}>
            {person.photoAttachmentId ? <span className="ped-portrait ped-photo"><img src={`/api/photos/${person.photoAttachmentId}`} alt="" /></span> : <Silhouette gender={person.gender} />}
            <span className="fill-cell">{name.first || "—"}</span>
            <span className="fill-cell fill-cell-last">{name.last || "—"}</span>
            <span className="fill-cell fill-cell-year">{fillBirthYear(person) ?? "—"}</span>
            <span className="fill-cell fill-cell-gen" title={(maps.parentsOf.get(person.id) ?? []).length || (maps.childrenOf.get(person.id) ?? []).length ? undefined : "Placed by marriage — no recorded parents or children"}>{(maps.parentsOf.get(person.id) ?? []).length || (maps.childrenOf.get(person.id) ?? []).length ? generation + 1 : `~${generation + 1}`}</span>
            <span className="fill-row-missing">{missingOf(person).join(" · ")}</span>
          </button>
          {open && <div className="fill-fields">
            <p className="fill-context">{context(person)}</p>
            <div className="fill-field"><label>Name</label>{field("displayName", "Full name")}</div>
            <div className="fill-field"><label>Gender{person.gender ? "" : " · missing"}</label><div className="fill-gender">
              {(["female", "male"] as const).map((option) => <button key={option} type="button" className={form.gender === option ? "is-active" : ""} onClick={() => setForm({ ...form, gender: form.gender === option ? "" : option })}>{option === "female" ? "♀ Female" : "♂ Male"}</button>)}
            </div></div>
            <div className="fill-field"><label>Born{person.birthDate ? "" : " · missing"}</label>{field("birthDate", "1962 or 1962-04-17")}</div>
            <div className="fill-field"><label>Died <em>(leave empty if living)</em></label>{field("deathDate", "1990 or 1990-11-02")}</div>
            <div className="fill-field"><label>Birth city{person.birthCity || person.birthPlace ? "" : " · missing"}</label>{field("birthCity", "Qazvin")}</div>
            <div className="fill-field"><label>Birth country{person.birthCountry || person.birthPlace ? "" : " · missing"}</label>{field("birthCountry", "Iran")}</div>
            {person.biography && <p className="fill-bio">{person.biography}</p>}
            <div className="fill-actions">
              <button type="button" className="fill-save" disabled={busy} onClick={() => save(person)}>{busy ? "Saving…" : "Save"}</button>
              <button type="button" className="fill-skip" onClick={() => { setExpandedId(null); setForm({}); setNotice(""); }}>Cancel</button>
              <button type="button" className="fill-skip" onClick={() => onOpen(person)}>Open full record</button>
            </div>
          </div>}
        </div>
        </Fragment>;
      })}
    </div>
    <p className="fill-footnote">Sorted by family name — click a column heading to sort by first name, birth year, generation, or what’s missing, and filter to work through one generation at a time. Photos can be added from the full record. Everything saved here flows into the tree, the timeline, and the map.</p>
  </section>;
}
