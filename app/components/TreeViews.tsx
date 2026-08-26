"use client";

import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FamilyTree, Person } from "../../lib/types";
import { buildGenerations, buildRelationMaps } from "../../lib/tree-layout";

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

function place(person: Person) {
  return [person.birthCity, person.birthCountry].filter(Boolean).join(", ") || person.birthPlace || "";
}

export function FocusFamilyView({ tree, focusId, onPick, onBack, onForward, canBack, canForward, onOpen }: { tree: FamilyTree; focusId: string; onPick: (person: Person) => void; onBack?: () => void; onForward?: () => void; canBack?: boolean; canForward?: boolean; onOpen: (person: Person) => void }) {
  const maps = useMemo(() => buildRelationMaps(tree), [tree]);
  const containerRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef(new Map<string, HTMLDivElement>());
  const [paths, setPaths] = useState<string[]>([]);
  const model = useMemo(() => {
    const focal = maps.byId.get(focusId) ?? tree.people[0];
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
      grandSlots.push({ parentKey, person: grandfather, key: `${parentKey}-gf`, label: "Add father" });
      grandSlots.push({ parentKey, person: grandmother, key: `${parentKey}-gm`, label: "Add mother" });
      if (grandfather) links.push([parentKey, `${parentKey}-gf`]);
      if (grandmother) links.push([parentKey, `${parentKey}-gm`]);
    }
    return { focal, father, mother, spouses, children, siblings, childGroups, grandSlots, links };
  }, [maps, tree, focusId]);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !model) return;
    const draw = () => {
      const base = container.getBoundingClientRect();
      const next: string[] = [];
      for (const [fromKey, toKey] of model.links) {
        const from = slotRefs.current.get(fromKey)?.getBoundingClientRect();
        const to = slotRefs.current.get(toKey)?.getBoundingClientRect();
        if (!from || !to) continue;
        const x0 = from.right - base.left, y0 = from.top + from.height / 2 - base.top;
        const x1 = to.left - base.left, y1 = to.top + to.height / 2 - base.top;
        const mid = (x0 + x1) / 2;
        next.push(`M ${x0} ${y0} L ${mid} ${y0} L ${mid} ${y1} L ${x1} ${y1}`);
      }
      setPaths(next);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [model]);
  if (!model) return null;
  const { focal, father, mother, spouses, children, siblings, childGroups, grandSlots } = model;
  const statusOf = (spouse: Person) => maps.spouseStatus.get([focal.id, spouse.id].sort().join("|")) ?? null;
  const setRef = (key: string) => (element: HTMLDivElement | null) => {
    if (element) slotRefs.current.set(key, element);
    else slotRefs.current.delete(key);
  };
  const card = (person: Person, key: string, size: "lg" | "md" | "sm", subtitle?: string) =>
    <div ref={setRef(key)} className={`ped-card ped-card-${size} ${person.id === focal.id ? "is-focal" : ""}`} key={key}>
      <button type="button" onClick={() => onPick(person)}>
        {person.photoAttachmentId ? <span className="ped-portrait ped-photo"><img src={`/api/photos/${person.photoAttachmentId}`} alt="" /></span> : <Silhouette gender={person.gender} />}
        <span className="ped-copy">
          <strong>{person.displayName}</strong>
          <span>{years(person) || "dates unknown"}{subtitle ? ` · ${subtitle}` : ""}</span>
          {size === "lg" && place(person) && <span className="ped-place">{place(person)}</span>}
        </span>
      </button>
    </div>;
  const ghost = (label: string, key: string) =>
    <div ref={setRef(key)} className="ped-card ped-card-sm ped-ghost" key={key}>
      <button type="button" onClick={() => onOpen(focal)} title="Open the record to add this relative">＋ {label}</button>
    </div>;
  return <section className="focus-view ped-view" aria-label="Family around one person">
    <div className="focus-toolbar">
      <div className="focus-nav">
        <button type="button" className="focus-back" onClick={onBack} disabled={!canBack} aria-label="Back">←</button>
        <button type="button" className="focus-back" onClick={onForward} disabled={!canForward} aria-label="Forward">→</button>
      </div>
      <p className="focus-hint">Click a person to center the tree on them and open their record.</p>
    </div>
    <div className="ped-stage" ref={containerRef}>
      <svg className="ped-lines" aria-hidden="true">{paths.map((d, index) => <path key={index} d={d} />)}</svg>
      <div className="ped-columns">
        <div className="ped-col ped-col-children">
          <p className="ped-col-label">Children</p>
          {children.length === 0 && <p className="ped-none">none recorded</p>}
          {childGroups.map((group, index) => <div className="ped-group" key={index}>
            {(childGroups.length > 1 || spouses.length > 1) && <p className="ped-group-label">with {group.spouse?.displayName ?? "unrecorded partner"}</p>}
            {group.kids.map((child) => card(child, `child-${child.id}`, "md"))}
          </div>)}
        </div>
        <div className="ped-col ped-col-focal">
          <div className="ped-couple">
            {card(focal, "focal", "lg")}
            {spouses.map((spouse) => <div className="ped-spouse" key={spouse.id}><span className="ped-marriage">⚭</span>{card(spouse, `spouse-${spouse.id}`, "md", statusOf(spouse) ?? undefined)}</div>)}
          </div>
          {siblings.length > 0 && <details className="ped-siblings">
            <summary>Siblings ({siblings.length})</summary>
            {siblings.map((sibling) => card(sibling, `sib-${sibling.id}`, "sm"))}
          </details>}
        </div>
        <div className="ped-col ped-col-parents">
          <p className="ped-col-label">Parents</p>
          {father ? card(father, "p-father", "md") : ghost("Add father", "p-father")}
          {mother ? card(mother, "p-mother", "md") : ghost("Add mother", "p-mother")}
        </div>
        <div className="ped-col ped-col-grand">
          <p className="ped-col-label">Grandparents</p>
          {grandSlots.length === 0 && <p className="ped-none">—</p>}
          {grandSlots.map((slot) => <div className="ped-grand-slot" key={slot.key}>
            {slot.person ? card(slot.person, slot.key, "sm") : ghost(slot.label, slot.key)}
          </div>)}
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
      placeholder="Find a person…"
      value={query}
      autoComplete="off"
      aria-label="Find a person"
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

export function MissingDataView({ tree, onSaved, onOpen }: { tree: FamilyTree; onSaved: (tree: FamilyTree) => void; onOpen: (person: Person) => void }) {
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
    <div className="fill-progress">
      <strong>{complete}</strong> of {tree.people.length} records are complete · <strong>{incomplete.length}</strong> with gaps
      {notice && <span className="fill-notice"> · {notice}</span>}
    </div>
    <div className="fill-controls">
      <input className="fill-search" type="search" placeholder="Find a person to fill in…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Find a person to fill in" />
      <select className="fill-gen-filter" value={genFilter} onChange={(event) => setGenFilter(event.target.value)} aria-label="Filter by generation">
        <option value="">All generations</option>
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
            <span className="fill-cell fill-cell-last"><strong>{name.last || "—"}</strong></span>
            <span className="fill-cell fill-cell-year">{fillBirthYear(person) ?? "—"}</span>
            <span className="fill-cell fill-cell-gen">{generation + 1}</span>
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
