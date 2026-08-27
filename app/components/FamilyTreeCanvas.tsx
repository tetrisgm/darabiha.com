"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FamilyTree, Person } from "../../lib/types";
import { buildFamilyLayout, buildGenerations } from "../../lib/tree-layout";
import { Silhouette } from "./TreeViews";

const cardDateFormat = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
function cardDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return cardDateFormat.format(new Date(Date.UTC(year, month - 1, day)));
}

export function clampScale(scale: number) { return Math.max(0.5, Math.min(3, scale)); }
export function zoomView(view: { x: number; y: number; scale: number }, factor: number, cursor: { x: number; y: number }) {
  const scale = clampScale(view.scale * factor);
  return { scale, x: cursor.x - (cursor.x - view.x) * (scale / view.scale), y: cursor.y - (cursor.y - view.y) * (scale / view.scale) };
}

type CanvasCursorMode = "grab" | "grabbing" | "pointer";

function CanvasCursor({ mode, cursorRef }: { mode: CanvasCursorMode; cursorRef: React.RefObject<HTMLSpanElement | null> }) {
  return <span ref={cursorRef} className="tree-custom-cursor" data-mode={mode} data-visible="false" aria-hidden="true">
    <svg viewBox="0 0 32 32" focusable="false">
      {mode === "pointer" ? <path d="M9.5 3.5a2 2 0 0 1 4 0v9.1l1.1-1.4a2.1 2.1 0 0 1 3.4 2.4l.6-.8a2.1 2.1 0 0 1 3.5 2.2l.4-.4a2 2 0 0 1 3.4 1.9l-1.4 7.2a6.5 6.5 0 0 1-6.4 5.3h-2.7a7 7 0 0 1-5.7-3L5.8 20a2.2 2.2 0 0 1 3.4-2.7l.3.3V3.5Z" /> : mode === "grabbing" ? <path d="M8.3 12.4a2.2 2.2 0 0 1 3.4-1.8 2.3 2.3 0 0 1 4.1-.9 2.3 2.3 0 0 1 4.2.7 2.2 2.2 0 0 1 3.8 1.5l1 6.1a8.5 8.5 0 0 1-8.4 9.9h-.8a8.5 8.5 0 0 1-8.3-6.8l-.9-4.4a2.2 2.2 0 0 1 1.9-4.3Z" /> : <path d="M7.8 13.8V8.1a2 2 0 0 1 4 0v4.1-6.4a2 2 0 0 1 4 0v6-7.1a2 2 0 0 1 4 0v7.6-5.1a2 2 0 0 1 4 0v10.4a10 10 0 0 1-10 10h-.4a8.4 8.4 0 0 1-7.7-5L3.9 18a2.2 2.2 0 0 1 3.9-2v-2.2Z" />}
    </svg>
  </span>;
}

export function FamilyTreeCanvas({ tree, onSelect, highlightedIds = [], focusPersonId }: { tree: FamilyTree; onSelect: (person: Person) => void; highlightedIds?: string[]; focusPersonId?: string }) {
  // The canvas is heavy (hundreds of cards and connector segments); rendering
  // it during the server response repeatedly tripped the Worker CPU limit, so
  // the server sends a light shell and the tree appears on hydration.
  const ready = useSyncExternalStore(() => () => {}, () => true, () => false);
  // Branch folding: each parent card carries a chip; deep branches start
  // folded so the whole tree opens at a readable width.
  const fullLayout = useMemo(() => (ready ? buildFamilyLayout(tree) : null), [tree, ready]);
  const primaryChildren = useMemo(() => {
    const map = new Map<string, string[]>();
    if (fullLayout) for (const [child, parent] of fullLayout.primaryParent) map.set(parent, [...(map.get(parent) ?? []), child]);
    return map;
  }, [fullLayout]);
  const defaultCollapsed = useMemo(() => {
    const set = new Set<string>();
    if (!ready) return set;
    const depth = buildGenerations(tree).depth;
    for (const parent of primaryChildren.keys()) if ((depth.get(parent) ?? 0) >= 4) set.add(parent);
    return set;
  }, [tree, primaryChildren, ready]);
  const [collapsedState, setCollapsedState] = useState<Set<string> | null>(null);
  const collapsed = collapsedState ?? defaultCollapsed;
  const { visibleTree, hiddenCounts, visibleSet } = useMemo(() => {
    if (!fullLayout || collapsed.size === 0) {
      const counts = new Map<string, number>();
      return { visibleTree: tree, hiddenCounts: counts, visibleSet: new Set(tree.people.map((person) => person.id)) };
    }
    const parentless = new Set(tree.people.map((person) => person.id));
    for (const link of tree.relationships) if (link.type === "parent") parentless.delete(link.toPersonId);
    const spousesOf = new Map<string, string[]>();
    for (const link of tree.relationships) {
      if (link.type !== "spouse") continue;
      spousesOf.set(link.fromPersonId, [...(spousesOf.get(link.fromPersonId) ?? []), link.toPersonId]);
      spousesOf.set(link.toPersonId, [...(spousesOf.get(link.toPersonId) ?? []), link.fromPersonId]);
    }
    const hidden = new Set<string>();
    const hideDescendants = (id: string) => {
      for (const child of primaryChildren.get(id) ?? []) {
        if (hidden.has(child)) continue;
        hidden.add(child);
        hideDescendants(child);
      }
    };
    for (const id of collapsed) hideDescendants(id);
    for (const [id, partners] of spousesOf) {
      if (parentless.has(id) && partners.every((partner) => hidden.has(partner))) hidden.add(id);
    }
    const hiddenCounts = new Map<string, number>();
    const countBranch = (id: string): number => {
      const cached = hiddenCounts.get(id);
      if (cached !== undefined) return cached;
      let count = 0;
      for (const child of primaryChildren.get(id) ?? []) {
        count += 1 + countBranch(child);
        for (const spouse of spousesOf.get(child) ?? []) if (parentless.has(spouse)) count += 1;
      }
      hiddenCounts.set(id, count);
      return count;
    };
    for (const parent of primaryChildren.keys()) countBranch(parent);
    const visibleSet = new Set(tree.people.filter((person) => !hidden.has(person.id)).map((person) => person.id));
    const visibleTree: FamilyTree = {
      people: tree.people.filter((person) => visibleSet.has(person.id)),
      relationships: tree.relationships.filter((link) => visibleSet.has(link.fromPersonId) && visibleSet.has(link.toPersonId)),
      stories: tree.stories,
    };
    return { visibleTree, hiddenCounts, visibleSet };
  }, [tree, fullLayout, primaryChildren, collapsed]);
  // Every derived structure is computed once per tree, never per render frame
  // (panning re-renders on each pointermove).
  // The world is measured in fixed pixels (cards have a fixed width), so a
  // couple's gap, the dash pattern, and every bar length look the same on
  // every screen size; the viewport transform provides pan and zoom.
  const { positions, spouseLines, hooks } = useMemo(() => {
    if (!ready) return { positions: new Map<string, { x: number; y: number }>(), spouseLines: [] as { id: string; path: string; status: string | null }[], hooks: [] as never[] };
    const SLOT = 270, ROW = 190;
    const tree = visibleTree;
    const layout = buildFamilyLayout(tree);
    const positions = new Map<string, { x: number; y: number }>();
    for (const [id, slot] of layout.positions) positions.set(id, { x: (slot.x - layout.anchorX) * SLOT, y: 90 + slot.y * ROW });
    // marriages: a straight line between a couple sitting together, a raised
    // elbow between spouses drawn in different family blocks (cousin
    // marriages) so the line never runs through the cards between them
    const spouseLines = tree.relationships
      .filter((link) => link.type === "spouse")
      .map((link) => {
        const a = positions.get(link.fromPersonId);
        const b = positions.get(link.toPersonId);
        if (!a || !b) return null;
        const adjacent = Math.abs(a.x - b.x) <= SLOT * 1.2 && a.y === b.y;
        const lift = Math.min(a.y, b.y) - 75;
        return { id: link.id, a, b, status: link.status ?? null, path: adjacent ? `M ${a.x} ${a.y} L ${b.x} ${b.y}` : `M ${a.x} ${a.y} L ${a.x} ${lift} L ${b.x} ${lift} L ${b.x} ${b.y}` };
      })
      .filter((line): line is NonNullable<typeof line> => Boolean(line));
    // parent hooks: the bar spans the children; the drop comes from the couple
    // standing over them, and a parent living in another family block joins
    // with their own elbow instead of one bar across the whole canvas
    const parentsOfChild = new Map<string, string[]>();
    for (const link of tree.relationships) {
      if (link.type !== "parent") continue;
      parentsOfChild.set(link.toPersonId, [...(parentsOfChild.get(link.toPersonId) ?? []), link.fromPersonId]);
    }
    const sets = new Map<string, { parentIds: string[]; children: string[] }>();
    for (const [childId, parentIds] of parentsOfChild) {
      const sorted = [...new Set(parentIds)].sort();
      const key = sorted.join("|");
      const entry = sets.get(key) ?? { parentIds: sorted, children: [] };
      entry.children.push(childId);
      sets.set(key, entry);
    }
    // One line per meaning: descent is a single blue T - a drop from the
    // couple's marriage line (or the lone recorded parent), a bar over the
    // children, and a stem to each child. A parent who lives in another
    // family block is connected by their amber marriage elbow alone.
    const hooks = [...sets.values()].flatMap(({ parentIds, children }) => {
      const allChildPoints = children.map((id) => positions.get(id)).filter(Boolean) as { x: number; y: number }[];
      const parentPoints = parentIds.map((id) => positions.get(id)).filter(Boolean) as { x: number; y: number }[];
      if (!allChildPoints.length || !parentPoints.length) return [];
      // a child drawn beside their spouse in another family block gets an
      // elbow of their own; the sibling bar spans only the home cluster
      const parentCenter = parentPoints.reduce((sum, p) => sum + p.x, 0) / parentPoints.length;
      const sorted = [...allChildPoints].sort((a, b) => a.x - b.x);
      let cluster = [sorted[0]];
      const clusters: { x: number; y: number }[][] = [cluster];
      for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].x - sorted[index - 1].x > SLOT * 3) { cluster = [sorted[index]]; clusters.push(cluster); }
        else cluster.push(sorted[index]);
      }
      const core = clusters.sort((a, b) => {
        const da = Math.min(...a.map((p) => Math.abs(p.x - parentCenter)));
        const db = Math.min(...b.map((p) => Math.abs(p.x - parentCenter)));
        return b.length - a.length || da - db;
      })[0];
      const farChildren = allChildPoints.filter((p) => !core.includes(p));
      let barLeft = Math.min(...core.map((p) => p.x));
      let barRight = Math.max(...core.map((p) => p.x));
      const junctionY = Math.min(...core.map((p) => p.y)) - ROW / 2;
      const center = (barLeft + barRight) / 2;
      const near = parentPoints.filter((p) => p.x >= barLeft - SLOT * 2 && p.x <= barRight + SLOT * 2);
      const anchors = near.length ? near : [parentPoints.sort((a, b) => Math.abs(a.x - center) - Math.abs(b.x - center))[0]];
      const dropX = anchors.reduce((sum, p) => sum + p.x, 0) / anchors.length;
      const parentY = Math.max(...anchors.map((p) => p.y));
      barLeft = Math.min(barLeft, dropX);
      barRight = Math.max(barRight, dropX);
      return [{
        key: parentIds.join("|"),
        dropX, parentY, junctionY, barLeft, barRight,
        drops: core.map((p) => ({ x: p.x, y: p.y })),
        farLines: farChildren.map((p) => ({
          path: `M ${Math.abs(p.x - barLeft) < Math.abs(p.x - barRight) ? barLeft : barRight} ${junctionY} L ${p.x} ${junctionY} L ${p.x} ${p.y}`,
        })),
      }];
    });
    return { positions, spouseLines, hooks };
  }, [visibleTree, ready]);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [cursorMode, setCursorMode] = useState<CanvasCursorMode>("grab");
  const gesture = useRef<{ x: number; y: number; view: typeof view; moved: boolean } | null>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const zoomBy = (factor: number) => setView((current) => zoomView(current, factor, { x: 0, y: 0 }));
  const point = (person: Person) => positions.get(person.id) ?? { x: 0, y: 90 };
  const centerOn = (person: Person, animate = true) => {
    const rect = cursorRef.current?.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const p = point(person);
    const target = { x: -(p.x - rect.width / 2) * view.scale, y: -(p.y - rect.height / 2) * view.scale };
    if (!animate) { setView((current) => ({ ...current, ...target })); return; }
    const start = view; const started = performance.now();
    const tick = (now: number) => { const progress = Math.min(1, (now - started) / 360); const eased = 1 - (1 - progress) ** 3; setView((current) => ({ ...current, x: start.x + (target.x - start.x) * eased, y: start.y + (target.y - start.y) * eased })); if (progress < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  useEffect(() => {
    if (!focusPersonId || !fullLayout || visibleSet.has(focusPersonId)) return;
    const frame = requestAnimationFrame(() => {
      const next = new Set(collapsed);
      let current: string | undefined = focusPersonId;
      let guard = 0;
      while (current && guard < 60) { next.delete(current); current = fullLayout.primaryParent.get(current); guard += 1; }
      setCollapsedState(next);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPersonId, visibleSet, fullLayout, collapsed]);
  const lastCentered = useRef<string | null>(null);
  const enteredView = useRef(false);
  useEffect(() => {
    const person = focusPersonId ? tree.people.find((candidate) => candidate.id === focusPersonId) : undefined;
    if (!person || !positions.has(person.id) || lastCentered.current === person.id) return;
    const first = !enteredView.current;
    enteredView.current = true;
    lastCentered.current = person.id;
    // arriving in the Tree view should simply BE centred; only a later change
    // of focus is worth animating
    centerOn(person, !first);
  }, [focusPersonId, positions]);
  // open on the patriarch: world x 0 is the layout anchor
  const centered = useRef(false);
  useLayoutEffect(() => {
    if (!ready || centered.current) return;
    let raf = 0;
    const attempt = () => {
      const rect = cursorRef.current?.parentElement?.getBoundingClientRect();
      if (!rect || !rect.width) { raf = requestAnimationFrame(attempt); return; }
      centered.current = true;
      setView({ x: rect.width / 2, y: 30, scale: 1 });
    };
    attempt();
    return () => cancelAnimationFrame(raf);
  }, [ready]);
  const positionCursor = (event: React.PointerEvent<HTMLDivElement>) => {
    const cursor = cursorRef.current;
    if (!cursor || event.pointerType === "touch") return;
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    const target = event.target as Element;
    if (target.closest?.(".canvas-controls")) {
      cursor.dataset.visible = "false";
      return;
    }
    cursor.dataset.visible = "true";
    setCursorMode(gesture.current ? "grabbing" : target.closest?.(".tree-card, .branch-chip") ? "pointer" : "grab");
  };
  const hideCursor = () => {
    if (cursorRef.current && !gesture.current) cursorRef.current.dataset.visible = "false";
  };
  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { x: event.clientX, y: event.clientY, view, moved: false };
    setIsPanning(true);
    setCursorMode("grabbing");
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    positionCursor(event);
    if (!gesture.current) return;
    const dx = event.clientX - gesture.current.x;
    const dy = event.clientY - gesture.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) gesture.current.moved = true;
    setView((current) => ({ ...current, x: gesture.current!.view.x + dx, y: gesture.current!.view.y + dy }));
  };
  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    gesture.current = null;
    setIsPanning(false);
    setCursorMode((event.target as Element).closest?.(".tree-card, .branch-chip") ? "pointer" : "grab");
  };
  // Two-finger trackpad scroll pans the camera; a pinch arrives as a wheel
  // event with ctrlKey (metaKey kept for keyboard-modified zoom) and zooms.
  const wheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY > 0 ? .92 : 1.08;
      const rect = event.currentTarget.getBoundingClientRect();
      setView((current) => {
        const cx = event.clientX - rect.left - rect.width / 2;
        const cy = event.clientY - rect.top - rect.height / 2;
        return zoomView(current, factor, { x: cx, y: cy });
      });
    } else {
      setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
    }
  };
  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      setView({ ...view, x: view.x + (event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0), y: view.y + (event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0) });
    } else if (event.key === "+" || event.key === "=") setView({ ...view, scale: Math.min(3, view.scale * 1.1) });
    else if (event.key === "-" || event.key === "_") setView({ ...view, scale: Math.max(.5, view.scale * .9) });
    else if (event.key === "0") setView({ x: 0, y: 0, scale: 1 });
  };
  if (!ready) {
    return <div className="family-canvas" role="application" aria-label="Interactive family tree" aria-busy="true" data-interactive="false">
      <div className="canvas-hit-surface" aria-hidden="true" />
    </div>;
  }
  return <div className="family-canvas" role="application" aria-label="Interactive family tree. Use arrow keys to pan, plus or minus to zoom, and 0 to reset." tabIndex={0} data-custom-cursor="true" data-interactive="true" data-panning={isPanning ? "true" : "false"} style={{ cursor: isPanning ? "grabbing" : "grab" }} onKeyDown={keyDown} onPointerEnter={positionCursor} onPointerLeave={hideCursor} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onWheel={wheel}>
    <div className="canvas-hit-surface" aria-hidden="true" style={{ cursor: isPanning ? "grabbing" : "grab" }} />
    <div className="canvas-legend" aria-hidden="true"><i className="legend-swatch legend-parent" /> parent <i className="legend-swatch legend-marriage" /> marriage</div>
    <div className="canvas-controls" role="group" aria-label="Canvas zoom controls">
      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomBy(0.9)} aria-label="Zoom out" title="Zoom out">−</button>
      <button type="button" className="canvas-zoom-level" onPointerDown={(event) => event.stopPropagation()} onClick={() => setView({ x: 0, y: 0, scale: 1 })} aria-label={`Reset zoom to 100 percent`} title="Reset zoom">{Math.round(view.scale * 100)}%</button>
      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => zoomBy(1.1)} aria-label="Zoom in" title="Zoom in">＋</button>
    </div>
    <div className="tree-viewport" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
      <svg className="tree-connectors">
        {spouseLines.map((line) => <path className={`spouse-connector${line.status ? " is-ended" : ""}`} key={line.id} d={line.path} fill="none" />)}
        {hooks.map((hook) => <g className="parent-connector" key={hook.key}>
          <line x1={hook.dropX} y1={hook.parentY} x2={hook.dropX} y2={hook.junctionY} />
          <line x1={hook.barLeft} y1={hook.junctionY} x2={hook.barRight} y2={hook.junctionY} />
          {hook.drops.map((drop) => <line key={`${drop.x}-${drop.y}`} x1={drop.x} y1={hook.junctionY} x2={drop.x} y2={drop.y} />)}
          {hook.farLines.map((farLine, index) => <path key={index} d={farLine.path} fill="none" />)}
        </g>)}
      </svg>
      {visibleTree.people.map((person) => { const p = point(person); const location = [person.birthCity, person.birthCountry].filter(Boolean).join(", "); return <button className={`tree-card ${highlightedIds.includes(person.id) ? "is-highlighted" : ""}`} style={{ left: `${p.x}px`, top: `${p.y}px`, cursor: "pointer" }} key={person.id} onClick={() => { centerOn(person); onSelect(person); }} aria-label={`Open ${person.displayName}`}><span className="tree-card-portrait">{person.photoAttachmentId ? <img src={`/api/photos/${person.photoAttachmentId}`} alt="" /> : <Silhouette gender={person.gender} />}</span><span className="tree-card-copy"><strong>{person.displayName}</strong><span>{person.birthDate ? `Born ${cardDate(person.birthDate)}` : "Birth date unknown"}{location ? ` · ${location}` : ""}</span></span></button>; })}
      {[...primaryChildren.keys()].filter((id) => visibleSet.has(id) && positions.has(id)).map((id) => {
        const p = positions.get(id)!;
        const isFolded = collapsed.has(id);
        return <button key={`chip-${id}`} type="button" className="branch-chip" style={{ left: `${p.x}px`, top: `${p.y + 56}px` }} aria-label={isFolded ? `Show ${hiddenCounts.get(id) ?? 0} hidden family members` : "Hide this branch"} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); const next = new Set(collapsed); if (isFolded) next.delete(id); else next.add(id); setCollapsedState(next); }}>{isFolded ? `Show ${hiddenCounts.get(id) ?? 0} more` : "Hide branch"}</button>;
      })}
    </div>
    <CanvasCursor mode={cursorMode} cursorRef={cursorRef} />
  </div>;
}
