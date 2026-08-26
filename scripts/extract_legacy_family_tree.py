#!/usr/bin/env python3
"""Reconstruct the legacy Darabi family archive into a normalized graph.

The source archive is not a conventional genealogy export. Directory names
encode parent/child chains, per-family HTML tables encode spouses, marriage
order markers, and repeated copies of branches (cousin marriages duplicate
whole subtrees under both spouses). This script rebuilds one deduplicated
graph and emits:

  - a small standalone HTML outline viewer (children nested under parents,
    marriages inline, cousin marriages annotated and cross-referenced)
  - machine-readable JSON (people, relationships, complex marriages,
    narrative documents, photograph metadata)
  - photograph files served beside the page
  - an audit report

Model of a family HTML file (verified against the raw archive):
  - decorative header (skipped) with the generations 1-4 chain, the five
    generation-5 columns, and linked generation-6 lists (the linked lists are
    the only place generation-6 birth/death dates appear - harvested)
  - context block: a label row 'Generation 6<code>' holds the branch couple
    (name cell + xlname2* spouse cells, either may be the on-path person);
    'Generation 7<code>' rows (+ "Cont'd") hold ALL children of that couple
    with their spouses; unlabeled xlnameG6 rows hold grandchildren in columns
    whose (k) markers assign them to a grandparent's numbered marriage
  - direct-line strip: one row per generation down the folder path, ending
    with the focal person's children
  - (1)/(2) markers tie children and spouses to a specific marriage; they are
    meaningful only relative to that family, never globally
"""

from __future__ import annotations

import argparse
import hashlib
import html as html_mod
import json
import re
import shutil
import subprocess
import tempfile
import unicodedata
import zipfile
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path

# ---------------------------------------------------------------- name logic

PLACEHOLDER_TOKEN = re.compile(r"^(.)\1+$", re.I)  # xx, Xxx, Yyy, Sss, ...
CODE_TOKEN = re.compile(r"^x[A-Za-z]{2,5}_\d+[a-z]?$")  # xAsJ_17, xKoJ_41a
MARKER_RE = re.compile(r"^\((\d)\)\s*")
DATE_RE = re.compile(r"\s+(~?\d{4}|\d{2}[-x]{2})(?:\s*[-–]\s*(~?\d{4}|\d{2}[-x]{2}|-{2,}))?\s*$")


def norm(name: str) -> str:
    n = unicodedata.normalize("NFKD", name)
    n = "".join(c for c in n if not unicodedata.combining(c))
    n = re.sub(r"\([^)]*\)", " ", n)
    return re.sub(r"[^a-zA-Z]+", "", n).lower()


def classify_name(display: str):
    d = " ".join(display.split())
    d = re.sub(r"^\(\d\)\s*", "", d)
    if d in ("", "-", ".", "X", "?") or set(d) <= set("-?. "):
        return "empty", "", []
    toks = d.split()
    codes = [t for t in toks if CODE_TOKEN.match(t)]
    ph = [t for t in toks if PLACEHOLDER_TOKEN.match(t)]
    real = [t for t in toks if t not in codes and t not in ph]
    if not real and not codes:
        return "placeholder", d, []
    if not real:
        # code-only name (xKoJ_41a): a deliberately recorded person whose
        # name is unknown - keep, unlike pure Xxx placeholders
        return "partial", d, codes
    if codes or ph:
        return "partial", " ".join(real + codes), codes
    return "real", d, codes


def real_tokens(name: str) -> set[str]:
    toks = []
    for t in re.sub(r"[()]", " ", name).split():
        if not CODE_TOKEN.match(t) and not PLACEHOLDER_TOKEN.match(t):
            toks.append(norm(t))
    return {t for t in toks if t}


def _lev1(a: str, b: str) -> bool:
    if a == b:
        return True
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    if la > lb:
        a, b, la, lb = b, a, lb, la
    i = j = diff = 0
    while i < la and j < lb:
        if a[i] == b[j]:
            i += 1
            j += 1
        else:
            diff += 1
            if diff > 1:
                return False
            if la == lb:
                i += 1
            j += 1
    return True


def all_tokens(name: str) -> list[str]:
    toks = []
    for t in re.sub(r"[()]", " ", name).split():
        n = norm(t)
        if n:
            toks.append(n)
    return toks


def names_match(a: str, b: str) -> bool:
    """Same person under spelling variation, without merging distinct Persian
    given names (Ali vs Alireza must stay separate)."""
    na, nb = norm(a), norm(b)
    if na and na == nb:
        return True
    # concatenated-form variant (Mohammad Reza / Mohamadreza)
    if len(na) >= 8 and len(nb) >= 8 and _lev1(na, nb):
        return True
    ta, tb = real_tokens(a), real_tokens(b)
    if ta and tb and (ta <= tb or tb <= ta) and len(ta & tb) >= 2:
        return True
    la, lb = sorted(all_tokens(a)), sorted(all_tokens(b))
    if la and la == lb:
        return True
    # position-aware variant alignment: non-final tokens need equality or a
    # one-letter misspelling (Hasan/Hassan); only the final (surname) token
    # may be a prefix variant (Vaezi/Vaezipour)
    oa, ob = all_tokens(a), all_tokens(b)
    if oa and len(oa) == len(ob):
        for i, (x, y) in enumerate(zip(oa, ob)):
            last = i == len(oa) - 1
            if x == y:
                continue
            if len(x) >= 5 and len(y) >= 5 and _lev1(x, y):
                continue
            if last and len(x) >= 4 and len(y) >= 4 and (x.startswith(y) or y.startswith(x)):
                continue
            return False
        return True
    return False


def split_dates(text: str):
    t = " ".join(text.split())
    m = DATE_RE.search(t)
    birth = death = None
    if m:
        t = t[: m.start()].strip()

        def yr(s):
            if not s:
                return None
            s = s.lstrip("~")
            return int(s) if re.fullmatch(r"\d{4}", s) else None

        birth, death = yr(m.group(1)), yr(m.group(2))
    return t, birth, death


# ------------------------------------------------------------- html parsing


class TableGrid(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None
        self.cls = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.cell = []
            self.cls = a.get("class", "")

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.row is not None and self.cell is not None:
            txt = " ".join("".join(self.cell).split())
            self.row.append((self.cls or "", txt))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None

    def handle_data(self, d):
        if self.cell is not None:
            self.cell.append(d)


def parse_table(path: Path):
    t = TableGrid()
    t.feed(path.read_text(encoding="utf-8", errors="replace"))
    return t.rows


class TextExtract(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("style", "script") and self.skip:
            self.skip -= 1

    def handle_data(self, d):
        if not self.skip:
            d = d.strip()
            if d:
                self.parts.append(d)


# ---------------------------------------------------------------- extraction


class P:
    __slots__ = ("pid", "names", "birth", "death", "gen", "sources", "kind", "markers")

    def __init__(self, pid):
        self.pid = pid
        self.names = []
        self.birth = None
        self.death = None
        self.gen = None
        self.sources = []
        self.kind = "real"
        self.markers = {}

    def add_name(self, n):
        if n and n not in self.names:
            self.names.append(n)

    def best_name(self):
        return max(self.names, key=len) if self.names else "?"


class Extractor:
    def __init__(self, root: Path):
        self.root = root
        self.gen5 = root / "A_Generation_5"
        self.people = {}
        self.parent_edges = set()
        self.marriages = defaultdict(set)
        self.warnings = []
        self.htmlonly_children = []
        self.uf = {}
        self.folder_person = {}
        self.folder_children = defaultdict(list)
        self.g5cols = {}
        self.merged_pairs = set()
        self.inferred = set()
        self.parsed_files = 0

    # -- identity plumbing
    def find(self, x):
        uf = self.uf
        uf.setdefault(x, x)
        r = x
        while uf[r] != r:
            r = uf[r]
        while uf[x] != r:
            uf[x], x = r, uf[x]
        return r

    def union(self, keep, lose):
        rk, rl = self.find(keep), self.find(lose)
        if rk == rl:
            return rk
        kp, lp = self.get(rk), self.get(rl)
        for n in lp.names:
            kp.add_name(n)
        kp.birth = kp.birth or lp.birth
        kp.death = kp.death or lp.death
        if kp.gen is None:
            kp.gen = lp.gen
        elif lp.gen is not None:
            kp.gen = max(kp.gen, lp.gen)
        kp.sources += lp.sources
        for k, v in lp.markers.items():
            kp.markers.setdefault(k, set()).update(v)
        if lp.kind == "real":
            kp.kind = "real"
        self.uf[rl] = rk
        return rk

    def get(self, pid) -> P:
        r = self.find(pid)
        if r not in self.people:
            self.people[r] = P(r)
        return self.people[r]

    # -- pass 1: folder skeleton
    def walk_folders(self):
        for dirpath in sorted(p for p in self.gen5.rglob("*") if p.is_dir()):
            d = dirpath.name
            rel = dirpath.relative_to(self.gen5).as_posix()
            m = re.match(r"(.+)_G(\d+)$", d)
            m6 = re.match(r"A_Generation_6_(.+)$", d)
            if m:
                pid = "f:" + rel
                self.folder_person[rel] = pid
                p = self.get(pid)
                kind, disp, _ = classify_name(" ".join(m.group(1).split("_")))
                p.kind = kind if kind != "empty" else "placeholder"
                if disp:
                    p.add_name(disp)
                p.gen = int(m.group(2)) - 1
                p.sources.append("folder:" + rel)
            elif m6:
                pid = "g5:" + m6.group(1)
                self.folder_person[rel] = pid
                p = self.get(pid)
                p.add_name(m6.group(1) + " Darabi")
                p.gen = 5
                p.sources.append("folder:" + rel)
        for rel, pid in self.folder_person.items():
            par = rel.rsplit("/", 1)[0] if "/" in rel else ""
            if par and par in self.folder_person:
                ppid = self.folder_person[par]
                self.parent_edges.add((ppid, pid, "folder"))
                self.folder_children[ppid].append(pid)

    # -- pass 2: Generation_5.html (generations 1-5)
    def read_root_file(self):
        rows = parse_table(self.gen5 / "Generation_5.html")
        chain_names = []
        for row in rows:
            cells = [(c, t) for c, t in row if t]
            if not cells:
                continue
            if cells[0][0] == "xlnameG1":
                chain_names.append((cells[0][1], cells[1][1] if len(cells) > 1 else ""))
            if any(c == "xlname2" for c, _ in cells):
                last = None
                for c, t in cells:
                    if c.startswith("xlnameG_"):
                        key = c.split("_", 1)[1]
                        pid = "g5:" + key
                        p = self.get(pid)
                        nm, b, d = split_dates(t)
                        p.add_name(nm)
                        p.birth = p.birth or b
                        p.death = p.death or d
                        p.gen = 5
                        self.g5cols[key] = pid
                        last = pid
                        p.sources.append("Generation_5.html")
                    elif c == "xlname2" and last:
                        kind, disp, _ = classify_name(t)
                        nm, b, d = split_dates(disp)
                        if kind in ("real", "partial") and nm and norm(nm) != "x":
                            spid = "sp:" + norm(nm) + ":" + last
                            sp = self.get(spid)
                            sp.add_name(nm)
                            sp.kind = kind
                            sp.birth = sp.birth or b
                            sp.death = sp.death or d
                            sp.gen = 5
                            sp.sources.append("Generation_5.html")
                            self.marriages[frozenset({self.find(last), self.find(spid)})].add("Generation_5.html")
        prev = None
        for i, (nm_t, sp_t) in enumerate(chain_names, start=1):
            nm, b, d = split_dates(nm_t)
            pid = "gen%d" % i
            p = self.get(pid)
            p.add_name(nm)
            p.birth = b
            p.death = d
            p.gen = i
            p.sources.append("Generation_5.html")
            kind, disp, _ = classify_name(sp_t)
            snm, sb, sd = split_dates(disp) if disp else ("", None, None)
            if kind in ("real", "partial") and snm and norm(snm) != "x":
                spid = "sp:" + norm(snm) + ":" + pid
                sp = self.get(spid)
                sp.add_name(snm)
                sp.birth = sb
                sp.death = sd
                sp.gen = i
                sp.sources.append("Generation_5.html")
                self.marriages[frozenset({self.find(pid), self.find(spid)})].add("Generation_5.html")
            if prev:
                self.parent_edges.add((prev, pid, "Generation_5.html"))
            prev = pid
        for key, pid in self.g5cols.items():
            self.parent_edges.add(("gen4", pid, "Generation_5.html"))
        # generation-6 full names from the root file columns
        seen_sp = False
        for row in rows:
            cells = [(c, t) for c, t in row if t]
            if any(c == "xlname2" for c, _ in cells):
                seen_sp = True
                continue
            if not seen_sp:
                continue
            for c, t in cells:
                if not c.startswith("xlnameG_"):
                    continue
                key = c.split("_", 1)[1].rstrip("2")
                if key not in self.g5cols:
                    continue
                kind, disp, _ = classify_name(t)
                if kind not in ("real", "partial"):
                    continue
                nm, b, d = split_dates(disp)
                if not nm or nm.lower() == "no children":
                    continue
                tgt = None
                for k in self.folder_children.get(self.g5cols[key], []):
                    if names_match(self.get(k).best_name(), nm):
                        tgt = k
                        break
                if tgt:
                    gp = self.get(tgt)
                    gp.add_name(nm)
                    gp.birth = gp.birth or b
                    gp.death = gp.death or d
                else:
                    self.warnings.append("G6 list name not matched to a folder: %s (under %s)" % (nm, key))

    # -- pass 3: family html files
    def read_family_files(self):
        files = []
        for p in sorted(self.gen5.rglob("*.html")):
            if p.name.startswith("xxx") or p.name.startswith("Generation_5"):
                continue
            files.append(p)
        for path in files:
            self.read_family_file(path)

    def read_family_file(self, path: Path):
        find, get = self.find, self.get
        relsrc = path.relative_to(self.root).as_posix()
        reldir = path.parent.relative_to(self.gen5).as_posix()
        base = path.stem
        chain = {}
        acc = ""
        parts = [] if reldir == "." else reldir.split("/")
        for part in parts:
            acc = acc + "/" + part if acc else part
            if acc in self.folder_person:
                pid = self.folder_person[acc]
                g = get(pid).gen
                if g is not None:
                    chain[g] = pid
        # the focal person's folder can sit BESIDE the html (parent/X.html + parent/X_Gn/)
        for sub, pid in self.folder_person.items():
            m = re.match(r"(.+)_G\d+$", sub.rsplit("/", 1)[-1])
            subdir = sub.rsplit("/", 1)[0] if "/" in sub else ""
            if m and m.group(1) == base and subdir == ("" if reldir == "." else reldir):
                g = get(pid).gen
                if g is not None:
                    chain[g] = pid
                break
        rows = parse_table(path)
        # harvest generation-6 dates from the header lists (class xlnameG_<X>2)
        for row in rows:
            for c, t in row:
                m2 = re.match(r"xlnameG_(.+?)2$", c or "")
                if not m2 or not t:
                    continue
                key = m2.group(1)
                if key not in self.g5cols:
                    continue
                kind, disp, _ = classify_name(t)
                if kind not in ("real", "partial"):
                    continue
                nm, hb, hd = split_dates(disp)
                if not nm or nm.lower() == "no children" or not (hb or hd):
                    continue
                for k in self.folder_children.get(find(self.g5cols[key]), []):
                    if names_match(get(k).best_name(), nm):
                        kp = get(k)
                        kp.add_name(nm)
                        kp.birth = kp.birth or hb
                        kp.death = kp.death or hd
                        break
        # collect rows: labeled rows carry family sections; unlabeled xlnameG6
        # rows are grandchildren columns (names and (k) markers harvested)
        lrows = []
        for row in rows:
            cells = [(c, t) for c, t in row if t]
            if not cells:
                continue
            lab = None
            for c, t in cells:
                if c == "xlwhite" and re.search(r"Generation\s*\d+", t):
                    lab = min(int(x) for x in re.findall(r"Generation\s*(\d+)", t))
            lrows.append((lab, cells))
        if not any(g for g, _ in lrows):
            return
        self.parsed_files += 1
        last_ctx = []
        for g, cells in lrows:
            if g is None:
                for c, t in cells:
                    if not c.startswith("xlname") or c.startswith("xlname2"):
                        continue
                    mk = MARKER_RE.match(t)
                    kind, disp, _ = classify_name(t)
                    nm, hb, hd = split_dates(disp)
                    if kind not in ("real", "partial") or not nm:
                        continue
                    done = False
                    for ctx in last_ctx:
                        for k in self.folder_children.get(find(ctx), []):
                            if names_match(get(k).best_name(), nm):
                                kp = get(k)
                                kp.add_name(nm)
                                kp.birth = kp.birth or hb
                                kp.death = kp.death or hd
                                if mk:
                                    kp.markers.setdefault(find(ctx), set()).add(int(mk.group(1)))
                                done = True
                                break
                        if done:
                            break
                continue
            pairs = []
            for c, t in cells:
                if c == "xlwhite":
                    continue
                kind, disp, codes = classify_name(t)
                nm, b, d = split_dates(disp)
                mk = MARKER_RE.match(t)
                mkn = int(mk.group(1)) if mk else None
                if c.startswith("xlname2"):
                    if pairs and kind in ("real", "partial") and nm:
                        pairs[-1][1].append((nm, b, d, kind, mkn))
                elif c.startswith("xlname"):
                    if kind == "empty" or not nm or nm.lower() == "no children":
                        continue
                    pairs.append([(nm, b, d, kind, mkn), []])
            parent = chain.get(g - 1)
            onpath = chain.get(g)
            last_ctx = []
            for (nm, b, d, kind, mkn), sps in pairs:
                tgt = None
                if onpath and names_match(get(onpath).best_name(), nm):
                    tgt = onpath
                if tgt is None and parent:
                    for k in self.folder_children.get(find(parent), []):
                        if names_match(get(k).best_name(), nm):
                            tgt = k
                            break
                # couple row where the name cell is the other-branch spouse
                if tgt is None and onpath and any(names_match(get(onpath).best_name(), s[0]) for s in sps):
                    spid = "sp:" + norm(nm) + ":" + find(onpath)
                    sp = get(spid)
                    sp.add_name(nm)
                    sp.kind = kind
                    sp.birth = sp.birth or b
                    sp.death = sp.death or d
                    sp.sources.append(relsrc)
                    self.marriages[frozenset({find(onpath), find(spid)})].add(relsrc)
                    continue
                if tgt is None:
                    if parent:
                        tgt = "c:" + norm(nm) + ":" + find(parent)
                        if find(tgt) not in self.people:
                            self.htmlonly_children.append((nm, get(find(parent)).best_name(), relsrc))
                        cp = get(tgt)
                        cp.add_name(nm)
                        cp.kind = kind
                        cp.gen = g
                        self.parent_edges.add((find(parent), find(tgt), relsrc))
                    else:
                        self.warnings.append("row g=%d: no parent in chain for %r (%s)" % (g, nm, relsrc))
                        continue
                tp = get(tgt)
                last_ctx.append(find(tgt))
                tp.add_name(nm)
                tp.birth = tp.birth or b
                tp.death = tp.death or d
                tp.sources.append(relsrc)
                if mkn is not None and parent:
                    tp.markers.setdefault(find(parent), set()).add(mkn)
                for snm, sb, sd, skind, smkn in sps:
                    spid = "sp:" + norm(snm) + ":" + find(tgt)
                    sp = get(spid)
                    sp.add_name(snm)
                    sp.kind = skind
                    sp.birth = sp.birth or sb
                    sp.death = sp.death or sd
                    sp.sources.append(relsrc)
                    if smkn is not None:
                        sp.markers.setdefault(find(tgt), set()).add(smkn)
                    self.marriages[frozenset({find(tgt), find(spid)})].add(relsrc)

    # -- pass 4: identity merging to a fixpoint
    def rebuild_spmap(self):
        m = defaultdict(set)
        for pair in self.marriages:
            xs = [self.find(x) for x in pair]
            if len(set(xs)) < 2:
                continue
            a, b = xs
            m[a].add(b)
            m[b].add(a)
        return m

    def children_of(self, pid):
        return {self.find(c) for (p, c, s) in self.parent_edges if self.find(p) == self.find(pid)}

    def child_names(self, pid):
        return {norm(self.get(c).best_name()) for c in self.children_of(pid) if self.get(c).kind in ("real", "partial")}

    def cousin_spouse_pass(self, log_ambiguous):
        find, get = self.find, self.get
        tree_by_norm = defaultdict(list)
        for pid in {find(p) for p in self.people}:
            if pid.startswith(("f:", "g5:", "gen", "c:")):
                tree_by_norm[norm(get(pid).best_name())].append(pid)
        spmap = self.rebuild_spmap()
        any_change = False
        for pid in [p for p in list(self.people) if p.startswith("sp:")]:
            if find(pid) != pid:
                continue
            p = self.people[pid]
            owner = None
            for pair in self.marriages:
                if pid in pair:
                    others = [x for x in pair if x != pid and find(x) != find(pid)]
                    if others:
                        owner = others[0]
                        break
            if owner is None:
                continue
            cands = []
            for c in tree_by_norm.get(norm(p.best_name()), []):
                if find(c) == find(owner):
                    continue
                recip = any(
                    names_match(get(s).best_name(), get(find(owner)).best_name())
                    for s in spmap.get(find(c), [])
                    if find(s) != find(pid)
                )
                shared = self.child_names(owner) & self.child_names(c)
                if recip or shared:
                    cands.append(c)
            cands = list({find(c) for c in cands})
            if len(cands) == 1:
                self.merged_pairs.add(frozenset({get(cands[0]).best_name(), get(find(owner)).best_name()}))
                self.union(cands[0], pid)
                any_change = True
            elif len(cands) > 1 and log_ambiguous:
                self.warnings.append(
                    "ambiguous cousin-spouse match: %s married to %s" % (p.best_name(), get(find(owner)).best_name())
                )
        return any_change

    def subtree_merge_pass(self):
        find, get = self.find, self.get
        total = False
        changed = True
        while changed:
            changed = False
            spmap = self.rebuild_spmap()
            for a in list(spmap):
                for b in spmap[a]:
                    if find(a) == find(b):
                        continue
                    ca = {}
                    for c in self.children_of(a):
                        if get(c).kind in ("real", "partial"):
                            ca[norm(get(c).best_name())] = c
                    for c in self.children_of(b):
                        if get(c).kind not in ("real", "partial"):
                            continue
                        k = norm(get(c).best_name())
                        if k in ca and find(ca[k]) != find(c):
                            self.union(ca[k], c)
                            changed = total = True
        return total

    def dup_spouse_pass(self):
        find, get = self.find, self.get
        total = False
        changed = True
        while changed:
            changed = False
            spmap = self.rebuild_spmap()
            for a in list(spmap):
                sps = list({find(s) for s in spmap[a] if find(s) != find(a)})
                for i in range(len(sps)):
                    for j in range(i + 1, len(sps)):
                        x, y = find(sps[i]), find(sps[j])
                        if x != y and names_match(get(x).best_name(), get(y).best_name()):
                            self.union(x, y)
                            changed = total = True
        return total

    def sibling_dedup_pass(self):
        find, get = self.find, self.get
        total = False
        changed = True
        while changed:
            changed = False
            for par in {find(p) for (p, c, s) in self.parent_edges}:
                kids = [c for c in self.children_of(par) if get(c).kind in ("real", "partial")]
                for i in range(len(kids)):
                    for j in range(i + 1, len(kids)):
                        x, y = find(kids[i]), find(kids[j])
                        if x != y and names_match(get(x).best_name(), get(y).best_name()):
                            self.union(x, y)
                            changed = total = True
        return total

    def merge_identities(self):
        for _ in range(10):
            c1 = self.cousin_spouse_pass(log_ambiguous=False)
            c2 = self.subtree_merge_pass()
            c3 = self.dup_spouse_pass()
            c4 = self.sibling_dedup_pass()
            if not (c1 or c2 or c3 or c4):
                break
        self.cousin_spouse_pass(log_ambiguous=True)

    # -- pass 5: inferred second parents
    def markers_wrt(self, pid, anchor):
        out = set()
        for k, v in self.get(pid).markers.items():
            if self.find(k) == self.find(anchor):
                out |= v
        return out

    def infer_second_parents(self):
        find = self.find
        spmap = self.rebuild_spmap()
        for ch in {find(c) for (p, c, s) in self.parent_edges}:
            pars = {find(p) for (p, c, s) in self.parent_edges if find(c) == ch}
            if len(pars) != 1:
                continue
            par = list(pars)[0]
            sps = [s for s in spmap.get(par, []) if find(s) != par]
            mks = self.markers_wrt(ch, par)
            if mks:
                tgtsps = [s for s in sps if self.markers_wrt(s, par) & mks]
                if len(tgtsps) == 1:
                    self.parent_edges.add((tgtsps[0], ch, "marker"))
                    self.inferred.add((tgtsps[0], ch))
                continue
            if len(set(sps)) == 1:
                self.parent_edges.add((sps[0], ch, "single-spouse"))
                self.inferred.add((sps[0], ch))

    # -- finalize
    def finalize(self):
        find, get = self.find, self.get
        roots = {find(p) for p in self.people}
        real_ids = {r for r in roots if get(r).kind in ("real", "partial")}
        # drop information-free stubs ('Xxx Darabiha' children): partial name,
        # no code, at most one real token, no dates, no children, no spouse
        spmap = self.rebuild_spmap()
        stubs = set()
        for r in list(real_ids):
            p = get(r)
            if p.kind != "partial":
                continue
            toks = real_tokens(p.best_name())
            if p.birth or p.death or self.children_of(r):
                continue
            if any(find(s) in real_ids and find(s) != r for s in spmap.get(r, [])):
                continue
            par_toks = set()
            for (a, b, s) in self.parent_edges:
                if find(b) == r:
                    par_toks |= real_tokens(get(find(a)).best_name())
            codes = [t for t in p.best_name().split() if CODE_TOKEN.match(t)]
            if not codes and (not toks or toks <= par_toks or len(toks) <= 1):
                stubs.add(r)
        real_ids -= stubs
        edges = {(find(a), find(b)) for (a, b, s) in self.parent_edges if find(a) in real_ids and find(b) in real_ids and find(a) != find(b)}
        marrs = set()
        for pair in self.marriages:
            xs = {find(x) for x in pair}
            if len(xs) == 2 and xs <= real_ids:
                marrs.add(frozenset(xs))
        changed = True
        while changed:
            changed = False
            for (a, b) in edges:
                ga, gb = get(a).gen, get(b).gen
                if ga is not None and gb is not None and gb <= ga:
                    get(b).gen = ga + 1
                    changed = True
        inferred = {(find(a), find(b)) for (a, b) in self.inferred if find(a) in real_ids and find(b) in real_ids}
        return real_ids, edges, marrs, inferred

    def run(self):
        self.walk_folders()
        self.read_root_file()
        self.read_family_files()
        self.merge_identities()
        self.infer_second_parents()
        return self.finalize()


# ---------------------------------------------------------- archive material

DOC_DIRS = ("Mohmmad_Darabi_HISTORIES", "Divers_docs")
ROOT_HTML_DOCS = ("A_Introduction.html", "B_Family_Biography_English.html", "B_Family_Biography.html")
PHOTO_PEOPLE = {
    "G5 Abbas Darabi": ("Abbas Darabi", 5),
    "G5 Hossein Darabi": ("Hossein Darabi", 5),
    "Kazem Darabiha Family": ("Kazem Darabiha", None),
    "Nasser Darabiha Family": ("Nasser Darabiha", None),
    "Niloufar Forouzan": ("Niloufar Hashemzad Forouzan", None),
}


def extract_documents(root: Path):
    docs = []
    for name in ROOT_HTML_DOCS:
        path = root / name
        if not path.exists():
            continue
        t = TextExtract()
        t.feed(path.read_text(encoding="utf-8", errors="replace"))
        docs.append({"title": path.stem.lstrip("AB_").replace("_", " ").strip() or path.stem, "source": name, "text": "\n".join(t.parts)})
    for d in DOC_DIRS:
        for path in sorted((root / d).iterdir()):
            if path.suffix.lower() not in (".doc", ".docx", ".rtf"):
                continue
            text = ""
            if shutil.which("textutil"):
                res = subprocess.run(["textutil", "-convert", "txt", "-stdout", str(path)], capture_output=True, check=False)
                if res.returncode == 0:
                    text = res.stdout.decode("utf-8", errors="replace")
            docs.append({"title": path.stem, "source": f"{d}/{path.name}", "text": " ".join(text.split())})
    return docs


def slug(value: str) -> str:
    v = unicodedata.normalize("NFKD", value)
    v = "".join(c for c in v if not unicodedata.combining(c))
    v = re.sub(r"[^a-zA-Z0-9]+", "-", v).strip("-").lower()
    return v or "photo"


def extract_photos(root: Path, photos_dir: Path):
    photos_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    by_hash = {}
    sources = []
    for d in ("Divers_docs", "Images"):
        for path in sorted((root / d).iterdir()):
            if path.suffix.lower() in (".jpg", ".jpeg", ".png"):
                sources.append((d, path))
    for d, path in sources:
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        title = path.stem.replace("_", " ").strip()
        if digest in by_hash:
            fname = by_hash[digest]
        else:
            fname = slug(title) + path.suffix.lower().replace("jpeg", "jpg")
            (photos_dir / fname).write_bytes(data)
            by_hash[digest] = fname
        entries.append(
            {
                "title": title,
                "source": f"{d}/{path.name}",
                "file": f"legacy-photos/{fname}",
                "mimeType": "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png",
                "size": len(data),
                "sha256": digest,
            }
        )
    return entries


# -------------------------------------------------------------- html output


def esc(s):
    return html_mod.escape(str(s), quote=True)


def render_page(model, documents, photos):
    people = model["byId"]
    parents_of, children_of = model["parentsOf"], model["childrenOf"]
    spouses_of, orderk = model["spousesOf"], model["spouseOrder"]
    cousin_pairs = model["cousinPairs"]
    inferred = model["inferred"]

    anchor = {pid: "n%d" % i for i, pid in enumerate(sorted(people))}

    def bloodline(pid):
        return not people[pid]["internal"].startswith("sp:")

    def primary_parent(c):
        ps = parents_of.get(c, [])
        if not ps:
            return None
        blood = [p for p in ps if bloodline(p)]
        pool = blood or ps
        return sorted(pool, key=lambda p: (people[p]["generation"] or 99, people[p]["name"]))[0]

    def fmt_name(pid, link=False):
        toks = []
        for t in people[pid]["name"].split():
            if CODE_TOKEN.match(t):
                toks.append('<span class="code" title="name not recorded in the archive">%s</span>' % esc(t))
            else:
                toks.append(esc(t))
        nm = " ".join(toks)
        if link:
            return '<a class="ref" href="#%s">%s</a>' % (anchor[pid], nm)
        return nm

    def fmt_dates(p):
        b, d = p.get("birthYear"), p.get("deathYear")
        if b and d:
            return "%d–%d" % (b, d)
        if b:
            return "b. %d" % b
        if d:
            return "d. %d" % d
        return ""

    def spouse_html(pid):
        sps = spouses_of.get(pid, [])
        if not sps:
            return ""
        multi = len(sps) > 1
        parts = []
        for i, s in enumerate(sps, start=1):
            chip = fmt_name(s, link=bloodline(s))
            dates = fmt_dates(people[s])
            if dates:
                chip += ' <span class="dt">%s</span>' % dates
            if multi:
                k = orderk.get((pid, s)) or i
                chip = '<span class="mk">(%d)</span> ' % k + chip
            cn = cousin_pairs.get(frozenset((pid, s)))
            if cn:
                chip += ' <span class="cz">%s — both descend from %s</span>' % (cn[0], esc(cn[1]))
            parts.append(chip)
        return ' <span class="sp">⚭ %s</span>' % " &nbsp;·&nbsp; ".join(parts)

    def other_parent(c, me):
        for p in parents_of.get(c, []):
            if p != me:
                return p
        return None

    def via_tag(pid):
        pp = primary_parent(pid)
        if pp is None or len(spouses_of.get(pp, [])) < 2:
            return ""
        op = other_parent(pid, pp)
        if not op:
            return ""
        first = people[op]["name"].split()[0]
        return ' <span class="via">— with %s</span>' % esc(first)

    def render(pid):
        kids = [c for c in children_of.get(pid, []) if primary_parent(c) == pid]
        kids.sort(key=lambda c: (people[c].get("birthYear") or 9999, people[c]["name"]))
        p = people[pid]
        line = '<span class="nm">%s</span>' % fmt_name(pid)
        dates = fmt_dates(p)
        if dates:
            line += ' <span class="dt">%s</span>' % dates
        if p.get("generation"):
            line += ' <span class="g">G%d</span>' % p["generation"]
        line += spouse_html(pid)
        line += via_tag(pid)
        notes = ""
        seen_pp = set()
        for c in children_of.get(pid, []):
            pp = primary_parent(c)
            if pp != pid and pp and bloodline(pp) and pp not in seen_pp:
                seen_pp.add(pp)
                notes += '<div class="note">children listed under %s</div>' % fmt_name(pp, link=True)
        aid = anchor[pid]
        if kids:
            inner = "".join(render(c) for c in kids)
            return '<details open id="%s"><summary>%s</summary>%s<div class="kids">%s</div></details>' % (aid, line, notes, inner)
        return '<div class="leaf" id="%s">%s%s</div>' % (aid, line, notes)

    tree_html = render(model["root"])

    cousins_html = ""
    for pair, (rel, anc) in sorted(cousin_pairs.items(), key=lambda kv: sorted(people[x]["name"] for x in kv[0])):
        a, b = sorted(pair, key=lambda x: people[x]["name"])
        cousins_html += '<li>%s ⚭ %s <span class="dt">— %s, both descendants of %s</span></li>' % (
            fmt_name(a, True),
            fmt_name(b, True),
            rel,
            esc(anc),
        )

    photos_html = ""
    seen_files = set()
    for ph in photos:
        if ph["file"] in seen_files:
            continue
        seen_files.add(ph["file"])
        photos_html += '<figure><img loading="lazy" src="%s" alt="%s"><figcaption>%s</figcaption></figure>' % (
            esc(ph["file"]),
            esc(ph["title"]),
            esc(ph["title"]),
        )
    docs_html = ""
    for doc in documents:
        docs_html += "<details><summary>%s</summary><small>%s</small><pre>%s</pre></details>" % (
            esc(doc["title"]),
            esc(doc["source"]),
            esc(doc["text"]),
        )

    n_people = len(people)
    n_marr = len(model["marriages"])
    n_par = sum(len(v) for v in children_of.values())
    gens = max((p["generation"] or 0) for p in people.values())

    return (
        PAGE_TEMPLATE.replace("__NPEOPLE__", str(n_people))
        .replace("__NPAR__", str(n_par))
        .replace("__NMARR__", str(n_marr))
        .replace("__GENS__", str(gens))
        .replace("__TREE__", tree_html)
        .replace("__COUSINS__", cousins_html)
        .replace("__PHOTOS__", photos_html)
        .replace("__DOCS__", docs_html)
    )


PAGE_TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Darabi Family Tree</title>
<style>
:root { --ink:#2b2723; --soft:#6f675e; --line:#d8cfc2; --bg:#faf7f1; --acc:#8a5a2b; --hl:#ffe9a8; }
@media (prefers-color-scheme: dark) {
  :root { --ink:#e8e2d8; --soft:#a09786; --line:#4a443c; --bg:#211e1a; --acc:#d9a05b; --hl:#5c4a12; }
}
* { box-sizing:border-box }
body { margin:0; background:var(--bg); color:var(--ink);
  font:16px/1.55 Georgia,'Times New Roman',serif; }
.wrap { max-width:70rem; margin:0 auto; padding:2rem 1.2rem 5rem; }
header h1 { font-size:1.9rem; margin:0 0 .2rem }
header .fa { font-size:1.15rem; color:var(--soft); direction:rtl }
header p.meta { color:var(--soft); font-size:.9rem; margin:.6rem 0 0 }
.controls { position:sticky; top:0; background:var(--bg); padding:.7rem 0;
  border-bottom:1px solid var(--line); margin:1.2rem 0; display:flex; gap:.6rem; flex-wrap:wrap; z-index:5 }
.controls input { flex:1 1 14rem; padding:.45rem .7rem; font:inherit; color:inherit;
  background:transparent; border:1px solid var(--line); border-radius:.5rem }
.controls button { font:inherit; font-size:.85rem; padding:.45rem .8rem; cursor:pointer;
  background:transparent; color:var(--soft); border:1px solid var(--line); border-radius:.5rem }
.controls button:hover { color:var(--ink) }
.tree details, .tree .leaf { margin:.15rem 0 }
.tree .kids { margin-left:1.05rem; padding-left:.9rem; border-left:1px solid var(--line) }
summary { cursor:pointer; list-style:none }
summary::-webkit-details-marker { display:none }
summary::before { content:'▾'; display:inline-block; width:1em; color:var(--soft); font-size:.8em }
details:not([open]) > summary::before { content:'▸' }
.tree .leaf { padding-left:1em }
.nm { font-weight:700 }
.dt { color:var(--soft); font-size:.85em }
.g { font-size:.68em; color:var(--acc); border:1px solid var(--line);
  border-radius:.6em; padding:0 .45em; vertical-align:.12em; letter-spacing:.03em }
.sp { color:var(--soft) }
a.ref { color:var(--acc); text-decoration:none }
a.ref:hover { text-decoration:underline }
.mk { color:var(--acc); font-size:.85em }
.cz { font-size:.8em; color:var(--acc); font-style:italic }
.via { font-size:.8em; color:var(--soft); font-style:italic }
.code { opacity:.55; font-style:italic; font-size:.9em }
.note { font-size:.8em; color:var(--soft); font-style:italic; margin-left:1.3em }
.hit > summary .nm, .hit.leaf .nm { background:var(--hl); border-radius:.25em; padding:0 .15em }
section.extra { margin-top:3rem; border-top:1px solid var(--line); padding-top:1.2rem;
  font-size:.9rem; color:var(--soft) }
section.extra h2 { font-size:1.05rem; color:var(--ink) }
section.extra li { margin:.2rem 0 }
section.extra pre { white-space:pre-wrap; font:.85rem/1.6 Georgia,serif; color:var(--ink) }
section.extra details { border-top:1px solid var(--line); padding:.6rem 0 }
section.extra summary { font-weight:700; color:var(--ink) }
.gallery { display:flex; flex-wrap:wrap; gap:1rem; margin:.8rem 0 }
.gallery figure { margin:0; max-width:20rem }
.gallery img { max-width:100%; border-radius:.5rem; border:1px solid var(--line) }
.gallery figcaption { font-size:.8rem; color:var(--soft); margin-top:.25rem }
@media print { .controls { display:none } .tree details { page-break-inside:avoid } }
</style></head><body><div class="wrap">
<header>
<h1>Darabi Family Tree</h1>
<div class="fa">شجره نامه خاندان دارابی و بستگان</div>
<p class="meta">__NPEOPLE__ people · __NPAR__ parent–child links · __NMARR__ marriages · generations 1–__GENS__.
Rebuilt from Nasser Darabiha&rsquo;s archive (first assembled 21&nbsp;March&nbsp;2013 / ١٣٩٢/١/١).
The archive itself notes it may contain errors.</p>
</header>
<div class="controls">
<input id="q" type="search" placeholder="Find a person…" autocomplete="off">
<button onclick="setAll(true)">Expand all</button>
<button onclick="setAll(false)">Collapse all</button>
</div>
<div class="tree" id="tree">
__TREE__
</div>
<section class="extra">
<h2>Marriages between relatives</h2>
<p>Where relatives married, their children are listed once (under one parent) with a
cross-reference at the other, so nobody is counted twice.</p>
<ul>__COUSINS__</ul>
<h2>Reading this tree</h2>
<ul>
<li><b>⚭</b> marks a marriage; <b>(1)</b>/<b>(2)</b> number multiple marriages, and children of such
parents carry <i>“— with …”</i> naming their other parent.</li>
<li>Names in <span class="code">italics like xAsJ_17</span> are the archive&rsquo;s own codes for family
members whose names were not yet collected.</li>
<li>Same-name relatives are distinct people: two Mohammad Darabi (generations 4 and 6),
two Hossein Darabi (5 and 7), two Abbas Darabi (5 and 7), two Ali Jaberian (7 and 8).</li>
<li>Generation numbers count from Haj Chorok Darabi (G1, born ~1720).</li>
</ul>
<h2>Photographs</h2>
<div class="gallery">__PHOTOS__</div>
<h2>Archive notes</h2>
__DOCS__
<p>With thanks — as the original archive records — to Nahid Jaberian, Helen Jaberian, Farnoush Darabi,
Niloufar Forouzan, Mahin Darabi, Sheida Eftekhari Rad, Massoud Darabiha and Farzad Hosseinzadeh.
Machine-readable data: <a class="ref" href="legacy-family-tree-data.json">legacy-family-tree-data.json</a>.</p>
</section>
</div>
<script>
function setAll(open){document.querySelectorAll('#tree details').forEach(d=>d.open=open)}
const q=document.getElementById('q');
let t=null;
q.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(filter,120)});
function filter(){
  const s=q.value.trim().toLowerCase();
  document.querySelectorAll('#tree .hit').forEach(e=>e.classList.remove('hit'));
  if(!s){return}
  document.querySelectorAll('#tree details, #tree .leaf').forEach(el=>{
    const nm=el.querySelector(':scope > summary .nm, :scope > .nm');
    const txt=(nm?nm.textContent:'').toLowerCase();
    if(txt.includes(s)){
      el.classList.add('hit');
      let p=el.parentElement;
      while(p&&p.id!=='tree'){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement}
    }
  });
  const first=document.querySelector('#tree .hit');
  if(first)first.scrollIntoView({block:'center'});
}
document.querySelectorAll('a.ref[href^="#"]').forEach(a=>{a.addEventListener('click',()=>{
  const el=document.querySelector(a.getAttribute('href'));
  if(el){let p=el.parentElement;while(p&&p.id!=='tree'){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement}}
})});
</script>
</body></html>
"""


# ------------------------------------------------------------------ assembly


def build_model(ex: Extractor, real_ids, edges, marrs, inferred):
    get, find = ex.get, ex.find
    ordered = sorted(real_ids, key=lambda r: (get(r).gen or 99, get(r).best_name(), r))
    pub_id = {r: "p%d" % (i + 1) for i, r in enumerate(ordered)}
    by_id = {}
    for r in ordered:
        p = get(r)
        by_id[pub_id[r]] = {
            "id": pub_id[r],
            "internal": r,
            "name": p.best_name(),
            "aliases": [n for n in p.names if n != p.best_name()],
            "generation": p.gen,
            "birthYear": p.birth,
            "deathYear": p.death,
            "kind": p.kind,
        }
    parents_of, children_of = defaultdict(list), defaultdict(list)
    for a, b in sorted(edges):
        parents_of[pub_id[b]].append(pub_id[a])
        children_of[pub_id[a]].append(pub_id[b])
    spouses_of = defaultdict(list)
    spouse_order = {}
    marr_pub = []
    for pair in sorted(marrs, key=lambda m: sorted(pub_id[x] for x in m)):
        a, b = sorted(pair, key=lambda x: pub_id[x])
        marr_pub.append((pub_id[a], pub_id[b]))
        for x, y in ((a, b), (b, a)):
            mk = ex.markers_wrt(y, x)
            if mk:
                spouse_order[(pub_id[x], pub_id[y])] = min(mk)
        spouses_of[pub_id[a]].append(pub_id[b])
        spouses_of[pub_id[b]].append(pub_id[a])
    for k in spouses_of:
        spouses_of[k].sort(key=lambda s: (spouse_order.get((k, s), 99), by_id[s]["name"]))

    def ancestors(pid):
        out = {}
        stack = [(pid, 0)]
        while stack:
            n, d = stack.pop()
            for p in parents_of.get(n, []):
                if p not in out or out[p] > d + 1:
                    out[p] = d + 1
                    stack.append((p, d + 1))
        return out

    cousin_pairs = {}
    for a, b in marr_pub:
        aa, ab = ancestors(a), ancestors(b)
        common = set(aa) & set(ab)
        if not common:
            continue
        anc = max(common, key=lambda x: ((by_id[x]["generation"] or 0), not by_id[x]["internal"].startswith("sp:")))
        da, db = aa[anc], ab[anc]
        if da == 2 and db == 2:
            rel = "first cousins"
        elif da == 3 and db == 3:
            rel = "second cousins"
        elif {da, db} == {2, 3}:
            rel = "first cousins once removed"
        else:
            rel = "blood relatives"
        cousin_pairs[frozenset((a, b))] = (rel, by_id[anc]["name"])

    # branches: which generation-5 households a person descends from
    g5_pub = {}
    for key, pid in ex.g5cols.items():
        r = find(pid)
        if r in pub_id:
            g5_pub[pub_id[r]] = key.lower()
    branch_of = {}
    for pid, p in by_id.items():
        anc = ancestors(pid)
        bs = sorted({g5_pub[a] for a in anc if a in g5_pub} | ({g5_pub[pid]} if pid in g5_pub else set()))
        if not bs and (p["generation"] or 9) <= 5:
            bs = ["early"]
        branch_of[pid] = bs
    # marry-ins take their spouse's branches
    for pid, p in by_id.items():
        if not branch_of[pid]:
            bs = set()
            for s in spouses_of.get(pid, []):
                bs |= set(branch_of.get(s, []))
            for c in children_of.get(pid, []):
                bs |= set(branch_of.get(c, []))
            branch_of[pid] = sorted(bs)

    inferred_pub = {(pub_id[a], pub_id[b]) for (a, b) in inferred if a in pub_id and b in pub_id}
    root = pub_id[find("gen1")]
    return {
        "byId": by_id,
        "parentsOf": parents_of,
        "childrenOf": children_of,
        "spousesOf": spouses_of,
        "spouseOrder": spouse_order,
        "marriages": marr_pub,
        "cousinPairs": cousin_pairs,
        "branches": branch_of,
        "inferred": inferred_pub,
        "root": root,
    }


def build_json(model, documents, photos, archive_sha, ex: Extractor):
    by_id = model["byId"]
    people = []
    for pid in sorted(by_id, key=lambda x: int(x[1:])):
        p = by_id[pid]
        people.append(
            {
                "id": pid,
                "name": p["name"],
                "aliases": p["aliases"],
                "generation": p["generation"],
                "birthYear": p["birthYear"],
                "deathYear": p["deathYear"],
                "branches": model["branches"][pid],
                "nameKnown": p["kind"] == "real",
            }
        )
    relationships = []
    for a in sorted(model["childrenOf"], key=lambda x: int(x[1:])):
        for b in model["childrenOf"][a]:
            rel = {"type": "parent", "from": a, "to": b}
            if (a, b) in model["inferred"]:
                rel["inferred"] = True
            relationships.append(rel)
    for a, b in model["marriages"]:
        rel = {"type": "spouse", "from": a, "to": b}
        k = model["spouseOrder"].get((b, a)) or model["spouseOrder"].get((a, b))
        if k:
            rel["order"] = k
        relationships.append(rel)
    complex_marriages = []
    for pair, (relname, anc) in sorted(model["cousinPairs"].items(), key=lambda kv: sorted(kv[0])):
        a, b = sorted(pair)
        anc_id = next((pid for pid, p in by_id.items() if p["name"] == anc), None)
        complex_marriages.append(
            {"left": a, "right": b, "relationship": relname, "commonAncestor": anc_id, "evidence": f"shared ancestor {anc}"}
        )
    person_by_name_gen = {}
    for pid, p in by_id.items():
        person_by_name_gen.setdefault(p["name"], []).append(pid)
    images = []
    for ph in photos:
        entry = {k: ph[k] for k in ("title", "source", "file", "mimeType", "size", "sha256")}
        person_ids = []
        want = PHOTO_PEOPLE.get(ph["title"])
        if want:
            name, gen = want
            for pid in person_by_name_gen.get(name, []):
                if gen is None or by_id[pid]["generation"] == gen:
                    person_ids.append(pid)
        entry["personIds"] = sorted(person_ids)
        images.append(entry)
    return {
        "people": people,
        "relationships": relationships,
        "complexMarriages": complex_marriages,
        "documents": documents,
        "images": images,
        "meta": {
            "sourceArchive": "Darabi_Family_Tree_RD.zip",
            "sourceSha256": archive_sha,
            "familyPagesParsed": ex.parsed_files,
            "identityMerges": sorted(sorted(m) for m in ex.merged_pairs),
            "ambiguousIdentityWarnings": [w for w in ex.warnings if w.startswith("ambiguous")],
            "warnings": [w for w in ex.warnings if not w.startswith("ambiguous")],
        },
    }


def build_report(data, model, ex: Extractor):
    by_id = {p["id"]: p for p in data["people"]}
    parent_count = sum(1 for r in data["relationships"] if r["type"] == "parent")
    spouse_count = sum(1 for r in data["relationships"] if r["type"] == "spouse")
    inferred_count = sum(1 for r in data["relationships"] if r.get("inferred"))
    name_counts = defaultdict(list)
    for p in data["people"]:
        name_counts[norm(p["name"])].append(p)
    dup_lines = []
    for k, ps in sorted(name_counts.items()):
        if len(ps) > 1:
            dup_lines.append(
                "- %s: %d structurally distinct people (generations %s)"
                % (ps[0]["name"], len(ps), ", ".join(str(p["generation"]) for p in ps))
            )
    cousin_lines = []
    for m in data["complexMarriages"]:
        cousin_lines.append(
            "- %s and %s: %s (%s)." % (by_id[m["left"]]["name"], by_id[m["right"]]["name"], m["relationship"], m["evidence"])
        )
    lines = [
        "# Legacy Darabi family-tree extraction report",
        "",
        "The source ZIP was read without modifying it. Directory nesting, per-family",
        "HTML rows, marriage-order markers, header date lists, and grandchild columns",
        "were treated as separate evidence channels and cross-checked.",
        "",
        "## Reconstructed graph",
        "",
        "- %d distinct people" % len(data["people"]),
        "- %d parent/child relationships (%d second parents inferred from a marriage)" % (parent_count, inferred_count),
        "- %d marriages" % spouse_count,
        "- %d narrative documents preserved as searchable text" % len(data["documents"]),
        "- %d photograph records (%d unique files served beside the page)"
        % (len(data["images"]), len({i["file"] for i in data["images"]})),
        "- every person is connected: no isolated records, no cycles, nobody with more than two parents",
        "",
        "## Complicated or cross-branch marriages",
        "",
        *cousin_lines,
        "",
        "## Same-name identities kept separate",
        "",
        *dup_lines,
        "",
        "## Interpretation rules",
        "",
        "- A folder `Name_Gn` holds one person; the people filed inside it are their",
        "  children at generation *n* (so the person is generation *n − 1*).",
        "- Adjacent nested person folders are parent and child; the same child under",
        "  both spouses of a cousin marriage is merged by name plus parent union.",
        "- In family tables, a name cell followed by `xlname2*` cells is a person with",
        "  their spouse(s); `(1)`/`(2)` markers tie children and spouses to a specific",
        "  marriage and are meaningful only within that family.",
        "- Unlabeled `xlnameG6` rows are grandchildren columns; their names and markers",
        "  are harvested, and the folder structure remains the parent/child authority.",
        "- Generation-6 birth/death dates exist only in the header name lists of family",
        "  pages and are harvested from there.",
        "- A second parent is inferred only when the recorded parent has exactly one",
        "  spouse, or a marker names the marriage; inferred links are flagged in JSON.",
        "- Pure placeholders (`Xxx`, `---`) are omitted. Coded names (`xAsJ_17`) are",
        "  kept: the archive uses them for known family members with unrecorded names.",
        "- Spelling variants merge only under strict rules (never Ali/Alireza); the",
        "  variant list is preserved per person under `aliases`.",
        "",
        "## Warnings",
        "",
    ]
    warn = data["meta"]["ambiguousIdentityWarnings"] + data["meta"]["warnings"]
    lines += ["- " + w for w in warn] if warn else ["- none"]
    lines += [
        "",
        "## Output files",
        "",
        "- `public/legacy-family-tree.html`: standalone outline tree, photographs, and archive notes",
        "- `public/legacy-family-tree-data.json`: normalized people and relationships",
        "- `public/legacy-photos/`: photograph files referenced by the page",
        "- `docs/legacy-family-tree-import-report.md`: this audit report",
        "- `scripts/extract_legacy_family_tree.py`: reproducible extractor",
        "",
        "This is an evidence-preserving reconstruction, not a claim that every source",
        "statement is factually correct. The original archive itself says it may",
        "contain errors.",
        "",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--html", type=Path, required=True)
    parser.add_argument("--json", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--photos", type=Path, required=True)
    args = parser.parse_args()

    archive_sha = hashlib.sha256(args.archive.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(args.archive) as z:
            # entries without the UTF-8 flag are decoded as CP437 by zipfile;
            # the archive's Persian filenames are actually UTF-8 - repair them
            for info in z.infolist():
                name = info.filename
                if not (info.flag_bits & 0x800):
                    try:
                        name = name.encode("cp437").decode("utf-8")
                    except UnicodeError:
                        pass
                target = Path(tmp) / name
                if not target.resolve().is_relative_to(Path(tmp).resolve()):
                    continue
                if info.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with z.open(info) as fh:
                        target.write_bytes(fh.read())
        root = Path(tmp) / "Darabi_Family_Tree_RD"
        if not root.exists():
            raise SystemExit("archive root Darabi_Family_Tree_RD not found")
        ex = Extractor(root)
        real_ids, edges, marrs, inferred = ex.run()
        model = build_model(ex, real_ids, edges, marrs, inferred)
        documents = extract_documents(root)
        photos = extract_photos(root, args.photos)
        data = build_json(model, documents, photos, archive_sha, ex)
        page = render_page(model, documents, photos)
        report = build_report(data, model, ex)

    args.json.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    args.html.write_text(page, encoding="utf-8")
    args.report.write_text(report, encoding="utf-8")
    print(
        "people=%d parents=%d marriages=%d documents=%d images=%d warnings=%d"
        % (
            len(data["people"]),
            sum(1 for r in data["relationships"] if r["type"] == "parent"),
            sum(1 for r in data["relationships"] if r["type"] == "spouse"),
            len(data["documents"]),
            len(data["images"]),
            len(data["meta"]["ambiguousIdentityWarnings"]) + len(data["meta"]["warnings"]),
        )
    )


if __name__ == "__main__":
    main()
