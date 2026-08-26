#!/usr/bin/env python3
"""Reconstruct the legacy Darabi family archive into a normalized graph.

The source archive is not a conventional genealogy export. Its directory names
encode parent/child chains, while HTML table rows encode spouses and repeated
copies of a branch. This script keeps evidence for every inferred relationship,
merges only identities that share a parent union, and emits a standalone HTML
viewer, machine-readable JSON, and an audit report.
"""

from __future__ import annotations

import argparse
import base64
import html
import json
import mimetypes
import re
import shutil
import subprocess
import tempfile
import zipfile
from collections import defaultdict, deque
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.parse import unquote


PLACEHOLDER_WORDS = {"x", "xx", "xxx", "yyy", "zzz", "sss", "unknown"}
BRANCHES = {
    "A_Generation_6_Hossein": ("Hossein Darabi", 5),
    "A_Generation_6_Fatemeh": ("Fatemeh Darabi", 5),
    "A_Generation_6_Ramazan": ("Ramazan Darabi", 5),
    "A_Generation_6_Ghassem": ("Ghassem Darabi", 5),
}


def collapse(value: str) -> str:
    return " ".join(html.unescape(value).replace("\xa0", " ").split())


def remove_marker(value: str) -> tuple[int | None, str]:
    match = re.match(r"^\s*\((\d+)\)\s*", value)
    if not match:
        return None, collapse(value)
    return int(match.group(1)), collapse(value[match.end() :])


def remove_years(value: str) -> str:
    return collapse(re.sub(r"\b(?:17|18|19|20)\d{2}\b(?:\s*[-–]\s*(?:\d{4}|\d{2}xx|present))?.*$", "", value, flags=re.I))


def normal(value: str) -> str:
    _, value = remove_marker(value)
    value = remove_years(value)
    return collapse(re.sub(r"[^a-z0-9]+", " ", value.lower()))


def identity(value: str) -> str:
    # Treat spacing variants such as Gholamreza/Gholam Reza as equal while
    # retaining every name token so Mohammad Rahim and Mohammad Karim never
    # collapse merely because they share a first name and surname.
    return normal(value).replace(" ", "")


def is_placeholder(value: str) -> bool:
    cleaned = normal(value)
    if not cleaned or cleaned in {"no children", "none"}:
        return True
    words = set(cleaned.split())
    # The archive often writes placeholders as "Xxx Darabi" or "Yyy
    # Darabiha". A placeholder given name is still a placeholder record even
    # when the family surname was filled in.
    first_word = cleaned.split()[0]
    return (bool(words) and words <= PLACEHOLDER_WORDS) or first_word in PLACEHOLDER_WORDS


def years(value: str) -> list[int]:
    return [int(item) for item in re.findall(r"(?<!\d)((?:17|18|19|20)\d{2})(?!\d)", value)]


def name_from_component(value: str) -> str:
    return collapse(value.replace("_", " "))


def readable_archive_name(value: str) -> str:
    """Repair UTF-8 filenames stored through the ZIP CP437 compatibility map."""
    try:
        repaired = value.encode("cp437").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value
    return repaired if re.search(r"[\u0600-\u06ff]", repaired) else value


def readable_source(path: Path) -> str:
    return "/".join(readable_archive_name(part) for part in path.parts)


def names_match(left: str, right: str) -> bool:
    left_normal = normal(left)
    right_normal = normal(right)
    if not left_normal or not right_normal:
        return False
    if identity(left) == identity(right):
        return True
    left_words = left_normal.split()
    right_words = right_normal.split()
    shorter, longer = sorted((left_words, right_words), key=len)
    if len(shorter) >= 2 and longer[-len(shorter) :] == shorter:
        return True
    # Parenthetical nicknames are inconsistently present. Permit the compact
    # first/surname form to match its longer form, but do not use this rule
    # when both sides contain differing middle names.
    return (
        len(shorter) == 2
        and shorter[0] == longer[0]
        and shorter[-1] == longer[-1]
    )


def probable_name_match(left: str, right: str) -> bool:
    if names_match(left, right):
        return True
    left_words = normal(left).split()
    right_words = normal(right).split()
    if not left_words or not right_words or left_words[-1] != right_words[-1]:
        # Vaezi/Vaezipour is used interchangeably in the archive's folder and
        # table spellings. Limit this rule to the Persian “-pour” suffix so a
        # broad surname-prefix heuristic cannot join unrelated Darabi names.
        same_given_name = left_words and right_words and left_words[0] == right_words[0]
        surnames = {left_words[-1], right_words[-1]}
        if not same_given_name or not any(longer == shorter + "pour" for shorter in surnames for longer in surnames):
            return False
        return True
    return SequenceMatcher(None, identity(left), identity(right)).ratio() >= 0.92


@dataclass
class Cell:
    css_class: str = ""
    text: str = ""
    links: list[str] = field(default_factory=list)


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[Cell]] = []
        self.row: list[Cell] | None = None
        self.cell: Cell | None = None
        self.title = ""
        self.in_title = False
        self.all_text: list[str] = []
        self.images: list[str] = []
        self.ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        tag = tag.lower()
        if tag in {"style", "script"}:
            self.ignored_depth += 1
        elif self.ignored_depth:
            return
        elif tag == "tr":
            self.row = []
        elif tag in {"td", "th"}:
            self.cell = Cell(css_class=attributes.get("class") or "")
        elif tag == "a" and self.cell is not None and attributes.get("href"):
            self.cell.links.append(attributes["href"] or "")
        elif tag == "img" and attributes.get("src"):
            self.images.append(attributes["src"] or "")
        elif tag == "title":
            self.in_title = True

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"style", "script"} and self.ignored_depth:
            self.ignored_depth -= 1
        elif self.ignored_depth:
            return
        elif tag in {"td", "th"} and self.cell is not None:
            self.cell.text = collapse(self.cell.text)
            if self.row is None:
                self.row = []
            self.row.append(self.cell)
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None
        elif tag == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.ignored_depth:
            return
        cleaned = collapse(data)
        if cleaned:
            self.all_text.append(cleaned)
        if self.cell is not None:
            self.cell.text += " " + data
        if self.in_title:
            self.title += data


@dataclass
class Person:
    raw_id: str
    name: str
    generation: int
    branch: str
    lineage: tuple[str, ...]
    structural: bool = True
    aliases: set[str] = field(default_factory=set)
    sources: set[str] = field(default_factory=set)
    birth_year: int | None = None
    death_year: int | None = None


class DSU:
    def __init__(self, items: Iterable[str]) -> None:
        self.parent = {item: item for item in items}

    def find(self, item: str) -> str:
        root = item
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[item] != item:
            parent = self.parent[item]
            self.parent[item] = root
            item = parent
        return root

    def union(self, left: str, right: str) -> bool:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root == right_root:
            return False
        self.parent[right_root] = left_root
        return True


class Extractor:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.people: dict[str, Person] = {}
        self.node_by_key: dict[tuple[str, tuple[str, ...]], str] = {}
        self.node_by_file: dict[Path, str] = {}
        self.parent_edges: list[tuple[str, str, str]] = []
        self.spouse_edges: list[tuple[str, str, str]] = []
        self.parsers: dict[Path, TableParser] = {}
        self.placeholder_count = 0
        self.ambiguous: list[str] = []
        self.manual_nodes: dict[str, str] = {}

    def add_person(
        self,
        name: str,
        generation: int,
        branch: str,
        lineage: tuple[str, ...],
        source: str,
        structural: bool = True,
    ) -> str | None:
        if is_placeholder(name):
            self.placeholder_count += 1
            return None
        # A lineage key is an exact structural address, not a fuzzy identity
        # match. In particular, Haj Chorok, Haj Agha, and Haj Khalil share the
        # same first/last tokens but are three different generations.
        key = (branch, tuple(normal(part) for part in lineage))
        if key in self.node_by_key:
            raw_id = self.node_by_key[key]
            person = self.people[raw_id]
            person.aliases.add(collapse(name))
            person.sources.add(source)
            return raw_id
        raw_id = f"raw-{len(self.people) + 1}"
        person = Person(
            raw_id=raw_id,
            name=collapse(name),
            generation=generation,
            branch=branch,
            lineage=lineage,
            structural=structural,
            aliases={collapse(name)},
            sources={source},
        )
        self.people[raw_id] = person
        self.node_by_key[key] = raw_id
        return raw_id

    def add_manual_tree(self) -> None:
        early = [
            ("Haj Chorok Darabi", 1, None, 1720, None),
            ("Haj Agha Darabi", 2, "Haj Chorok Darabi", None, None),
            ("Haj Khalil Darabi", 3, "Haj Agha Darabi", None, None),
            ("Mohammad Darabi", 4, "Haj Khalil Darabi", 1856, 1939),
            ("Salameh", 4, None, None, None),
            ("Hossein Darabi", 5, "Mohammad Darabi", 1882, 1937),
            ("Aategheh Dastmardi", 5, None, None, None),
            ("Fatemeh Darabi", 5, "Mohammad Darabi", 1889, None),
            ("Ramazan Jaberian", 5, None, None, None),
            ("Ramazan Darabi", 5, "Mohammad Darabi", 1893, 1986),
            ("Farkhondeh Ariyehbandha", 5, None, None, None),
            ("Ghassem Darabi", 5, "Mohammad Darabi", 1903, 1979),
            ("Robabeh Massoudi", 5, None, 1912, 2003),
            ("Abbas Darabi", 5, "Mohammad Darabi", None, None),
        ]
        for name, generation, _, birth, death in early:
            node = self.add_person(name, generation, "early", (name,), "A_Generation_5/Generation_5.html")
            assert node
            self.manual_nodes[normal(name)] = node
            self.people[node].birth_year = birth
            self.people[node].death_year = death
        for name, _, parent, _, _ in early:
            if parent:
                self.parent_edges.append((self.manual_nodes[normal(parent)], self.manual_nodes[normal(name)], "Generation_5.html"))
        mohammad = self.manual_nodes[normal("Mohammad Darabi")]
        salameh = self.manual_nodes[normal("Salameh")]
        for child in ["Hossein Darabi", "Fatemeh Darabi", "Ramazan Darabi", "Ghassem Darabi", "Abbas Darabi"]:
            self.parent_edges.append((salameh, self.manual_nodes[normal(child)], "Generation_5.html"))
        for left, right in [
            ("Mohammad Darabi", "Salameh"),
            ("Hossein Darabi", "Aategheh Dastmardi"),
            ("Fatemeh Darabi", "Ramazan Jaberian"),
            ("Ramazan Darabi", "Farkhondeh Ariyehbandha"),
            ("Ghassem Darabi", "Robabeh Massoudi"),
        ]:
            self.spouse_edges.append((self.manual_nodes[normal(left)], self.manual_nodes[normal(right)], "Generation_5.html"))

    def parse_html(self, path: Path) -> TableParser:
        if path not in self.parsers:
            parser = TableParser()
            parser.feed(path.read_text(encoding="utf-8", errors="replace"))
            self.parsers[path] = parser
        return self.parsers[path]

    def build_structural_people(self) -> None:
        generation_root = self.root / "A_Generation_5"
        for branch_dir, (ancestor_name, _) in BRANCHES.items():
            folder = generation_root / branch_dir
            ancestor = self.manual_nodes[normal(ancestor_name)]
            branch_label = branch_dir.replace("A_Generation_6_", "")
            for path in sorted(folder.rglob("*.html")):
                if path.name.lower().startswith("xxxgeneration"):
                    continue
                relative = path.relative_to(folder)
                components: list[tuple[str, int]] = []
                for part in relative.parts[:-1]:
                    match = re.match(r"(.+)_G(\d+)$", part, flags=re.I)
                    if match:
                        components.append((name_from_component(match.group(1)), int(match.group(2)) - 1))
                if not components and len(relative.parts) == 1:
                    current_name = name_from_component(path.stem)
                    node = self.add_person(current_name, 6, branch_label, (current_name,), str(path.relative_to(self.root)))
                    if node:
                        self.parent_edges.append((ancestor, node, str(path.relative_to(self.root))))
                        self.node_by_file[path.resolve()] = node
                    continue
                previous: str | None = None
                lineage: list[str] = []
                for index, (component_name, generation) in enumerate(components):
                    lineage.append(component_name)
                    node = self.add_person(component_name, generation, branch_label, tuple(lineage), str(path.relative_to(self.root)))
                    if node is None:
                        previous = None
                        continue
                    if index == 0:
                        self.parent_edges.append((ancestor, node, str(path.relative_to(self.root))))
                    elif previous:
                        self.parent_edges.append((previous, node, str(path.relative_to(self.root))))
                    previous = node
                if previous:
                    self.node_by_file[path.resolve()] = previous

    def resolve_href(self, source: Path, href: str) -> str | None:
        if not href or href.startswith("#") or "://" in href:
            return None
        target = (source.parent / unquote(href.split("#", 1)[0])).resolve()
        if target in self.node_by_file:
            return self.node_by_file[target]
        # A few links were copied with a broken directory prefix. A unique file
        # basename remains useful evidence, but an ambiguous basename is not.
        basename = target.name.lower()
        candidates = [node for file_path, node in self.node_by_file.items() if file_path.name.lower() == basename]
        if len(set(candidates)) == 1:
            return candidates[0]
        return None

    def branch_for_file(self, path: Path) -> str:
        for part in path.parts:
            if part in BRANCHES:
                return part.replace("A_Generation_6_", "")
        return "archive"

    def longest_common_lineage(self, left: tuple[str, ...], right: tuple[str, ...]) -> int:
        count = 0
        for left_part, right_part in zip(left, right):
            if identity(left_part) != identity(right_part):
                break
            count += 1
        return count

    def resolve_named_person(self, path: Path, name: str, generation: int | None, links: list[str]) -> str | None:
        for href in links:
            target = self.resolve_href(path, href)
            if target and any(probable_name_match(alias, name) for alias in self.people[target].aliases):
                return target
        all_candidates = [
            person
            for person in self.people.values()
            if person.structural
            and any(probable_name_match(alias, name) for alias in person.aliases)
        ]
        candidates = [person for person in all_candidates if generation is None or person.generation == generation]
        if not candidates and generation is not None:
            branch = self.branch_for_file(path)
            cross_generation = [person for person in all_candidates if person.branch == branch]
            if len(cross_generation) == 1 and abs(cross_generation[0].generation - generation) <= 2:
                return cross_generation[0].raw_id
        if not candidates:
            return None
        branch = self.branch_for_file(path)
        current = self.node_by_file.get(path.resolve())
        current_lineage = self.people[current].lineage if current else ()
        same_branch = [person for person in candidates if person.branch == branch]
        pool = same_branch or candidates
        pool.sort(
            key=lambda person: (
                self.longest_common_lineage(person.lineage, current_lineage),
                -(abs(person.generation - self.people[current].generation) if current else 0),
            ),
            reverse=True,
        )
        if len(pool) > 1:
            first_score = self.longest_common_lineage(pool[0].lineage, current_lineage)
            second_score = self.longest_common_lineage(pool[1].lineage, current_lineage)
            if first_score == second_score and pool[0].lineage != pool[1].lineage:
                self.ambiguous.append(f"Ambiguous identity: {name} (generation {generation}) in {path.relative_to(self.root)}")
        return pool[0].raw_id

    def make_partner(self, principal: str, name: str, generation: int, source: str) -> str | None:
        if is_placeholder(name):
            return None
        principal_person = self.people[principal]
        key_name = f"partner {identity(name)} of {principal_person.raw_id}"
        node = self.add_person(name, generation, f"partner:{principal_person.branch}", (key_name,), source, structural=False)
        return node

    def spouse_from_shared_children(
        self,
        path: Path,
        parser: TableParser,
        current_row: int,
        principal: str,
        spouse_name: str,
    ) -> str | None:
        """Prefer a same-name candidate already recorded as a child's parent.

        This resolves broken links in cross-generation marriages. In the
        Nikoo/Mehdi branch, for example, the spouse link points to Karim's page,
        while the nested folder correctly records Mehdi as Keon's parent.
        """
        branch = self.branch_for_file(path)
        candidates = [
            person.raw_id
            for person in self.people.values()
            if person.structural
            and probable_name_match(person.name, spouse_name)
            and person.raw_id != principal
        ]
        same_branch = [candidate for candidate in candidates if self.people[candidate].branch == branch]
        candidates = same_branch or candidates
        if len(candidates) < 2:
            return candidates[0] if candidates else None

        possible_children: set[str] = set()
        for row in parser.rows[current_row + 1 :]:
            if not row:
                continue
            generation_match = re.search(r"\bGeneration\s+(\d+)", row[0].text, flags=re.I)
            if not generation_match:
                continue
            generation = int(generation_match.group(1))
            for cell in row[1:]:
                css_class = cell.css_class.lower()
                if "xlname" not in css_class or "xlname2" in css_class or "xlname3" in css_class or "xlwhite" in css_class:
                    continue
                _, child_name = remove_marker(cell.text)
                if is_placeholder(child_name):
                    continue
                child = self.resolve_named_person(path, child_name, generation, cell.links)
                if child:
                    possible_children.add(child)

        scores = {
            candidate: sum(
                1
                for parent, child, _ in self.parent_edges
                if parent == candidate and child in possible_children
            )
            for candidate in candidates
        }
        best_score = max(scores.values(), default=0)
        best = [candidate for candidate, score in scores.items() if score == best_score and score > 0]
        return best[0] if len(best) == 1 else None

    def improve_current_person(self, path: Path, parser: TableParser, current: str) -> tuple[int | None, list[str]]:
        person = self.people[current]
        matching: list[tuple[int, int, list[Cell], Cell]] = []
        for row_index, row in enumerate(parser.rows):
            for cell_index, cell in enumerate(row):
                if "xlwhite" not in cell.css_class.lower() and names_match(person.name, cell.text):
                    matching.append((row_index, cell_index, row, cell))
                for href in cell.links:
                    target = self.resolve_href(path, href)
                    if target:
                        target_person = self.people[target]
                        if any(probable_name_match(alias, cell.text) for alias in target_person.aliases):
                            target_person.aliases.add(remove_years(cell.text))
                            target_person.sources.add(str(path.relative_to(self.root)))
                            found_years = years(cell.text)
                            if found_years:
                                target_person.birth_year = target_person.birth_year or found_years[0]
                                if len(found_years) > 1:
                                    target_person.death_year = target_person.death_year or found_years[1]
        if not matching:
            title_name = parser.title.split(":", 1)[-1].strip() if ":" in parser.title else ""
            if title_name and names_match(person.name, title_name):
                person.aliases.add(title_name)
            return None, []
        row_index, cell_index, row, cell = matching[-1]
        display = remove_years(cell.text)
        if display:
            person.aliases.add(display)
        found_years = years(cell.text)
        if found_years:
            person.birth_year = person.birth_year or found_years[0]
            if len(found_years) > 1:
                person.death_year = person.death_year or found_years[1]
        spouse_ids: list[str] = []
        for next_cell in row[cell_index + 1 :]:
            css_class = next_cell.css_class.lower()
            if "xlwhite" in css_class:
                break
            if "xlname2" not in css_class and "xlname3" not in css_class:
                break
            marker, spouse_name = remove_marker(next_cell.text)
            if is_placeholder(spouse_name):
                continue
            spouse = None
            for href in next_cell.links:
                candidate = self.resolve_href(path, href)
                if candidate and any(probable_name_match(alias, spouse_name) for alias in self.people[candidate].aliases):
                    spouse = candidate
                    break
            if spouse is None:
                spouse = self.spouse_from_shared_children(path, parser, row_index, current, spouse_name)
            if spouse is None:
                spouse = self.resolve_named_person(path, spouse_name, None, next_cell.links)
            if spouse is None:
                spouse = self.make_partner(current, spouse_name, person.generation, str(path.relative_to(self.root)))
            if spouse:
                self.people[spouse].aliases.add(spouse_name)
                self.spouse_edges.append((current, spouse, str(path.relative_to(self.root))))
                spouse_ids.append(spouse)
        return row_index, spouse_ids

    def parse_generation_pairs(self, path: Path, parser: TableParser) -> None:
        for row_index, row in enumerate(parser.rows):
            if not row:
                continue
            generation_match = re.search(r"\bGeneration\s+(\d+)", row[0].text, flags=re.I)
            if not generation_match:
                continue
            generation = int(generation_match.group(1))
            index = 1
            while index < len(row):
                cell = row[index]
                css_class = cell.css_class.lower()
                if "xlname" not in css_class or "xlwhite" in css_class or "xlname2" in css_class or "xlname3" in css_class:
                    index += 1
                    continue
                marker, principal_name = remove_marker(cell.text)
                if is_placeholder(principal_name):
                    index += 1
                    continue
                principal = self.resolve_named_person(path, principal_name, generation, cell.links)
                if principal is None:
                    branch = self.branch_for_file(path)
                    principal = self.add_person(principal_name, generation, branch, (f"row:{identity(principal_name)}",), str(path.relative_to(self.root)), structural=False)
                if principal:
                    self.people[principal].aliases.add(principal_name)
                    self.people[principal].generation = max(self.people[principal].generation, generation)
                    found_years = years(cell.text)
                    if found_years:
                        self.people[principal].birth_year = self.people[principal].birth_year or found_years[0]
                        if len(found_years) > 1:
                            self.people[principal].death_year = self.people[principal].death_year or found_years[1]
                index += 1
                while principal and index < len(row):
                    spouse_cell = row[index]
                    spouse_class = spouse_cell.css_class.lower()
                    if "xlname2" not in spouse_class and "xlname3" not in spouse_class:
                        break
                    _, spouse_name = remove_marker(spouse_cell.text)
                    if not is_placeholder(spouse_name):
                        spouse = self.spouse_from_shared_children(path, parser, row_index, principal, spouse_name)
                        if spouse is None:
                            spouse = self.resolve_named_person(path, spouse_name, None, spouse_cell.links)
                        if spouse is None:
                            spouse = self.make_partner(principal, spouse_name, generation, str(path.relative_to(self.root)))
                        if spouse:
                            self.people[spouse].aliases.add(spouse_name)
                            self.spouse_edges.append((principal, spouse, str(path.relative_to(self.root))))
                    index += 1

    def add_marked_child_parents(self, path: Path, parser: TableParser, current: str, current_row: int | None, spouses: list[str]) -> None:
        if current_row is None:
            return
        person = self.people[current]
        for row in parser.rows[current_row + 1 :]:
            if not row:
                continue
            generation_match = re.search(r"\bGeneration\s+(\d+)", row[0].text, flags=re.I)
            if not generation_match or int(generation_match.group(1)) != person.generation + 1:
                continue
            for cell in row[1:]:
                css_class = cell.css_class.lower()
                if "xlname" not in css_class or "xlname2" in css_class or "xlname3" in css_class or "xlwhite" in css_class:
                    continue
                marker, child_name = remove_marker(cell.text)
                if is_placeholder(child_name):
                    continue
                child = self.resolve_named_person(path, child_name, person.generation + 1, cell.links)
                if child is None:
                    continue
                self.parent_edges.append((current, child, str(path.relative_to(self.root))))
                if marker and 0 < marker <= len(spouses):
                    self.parent_edges.append((spouses[marker - 1], child, str(path.relative_to(self.root))))
                elif len(spouses) == 1:
                    self.parent_edges.append((spouses[0], child, str(path.relative_to(self.root))))

    def extract_relationships(self) -> None:
        for path, current in sorted(self.node_by_file.items(), key=lambda item: str(item[0])):
            parser = self.parse_html(path)
            current_row, spouses = self.improve_current_person(path, parser, current)
            self.parse_generation_pairs(path, parser)
            self.add_marked_child_parents(path, parser, current, current_row, spouses)

    def merge_people(self) -> DSU:
        dsu = DSU(self.people)
        parents_by_child: dict[str, set[str]] = defaultdict(set)
        spouses_by_person: dict[str, set[str]] = defaultdict(set)
        for parent, child, _ in self.parent_edges:
            parents_by_child[child].add(parent)
        for left, right, _ in self.spouse_edges:
            spouses_by_person[left].add(right)
            spouses_by_person[right].add(left)

        # A table row can spell a structural person's name differently from
        # their folder (for example Gholam Reza/Gholamreza). Join a row-only
        # record to a unique structural record before copied branches are
        # compared, so spouse and parent evidence meet on the same identity.
        for raw_id, person in self.people.items():
            if person.structural:
                continue
            candidates = [
                candidate_id
                for candidate_id, candidate in self.people.items()
                if candidate.structural
                and abs(candidate.generation - person.generation) <= 2
                and probable_name_match(candidate.name, person.name)
            ]
            same_branch = [
                candidate
                for candidate in candidates
                if self.people[candidate].branch == person.branch
                or person.branch == f"partner:{self.people[candidate].branch}"
            ]
            pool = same_branch or candidates
            if pool:
                nearest_distance = min(abs(self.people[candidate].generation - person.generation) for candidate in pool)
                nearest = [candidate for candidate in pool if abs(self.people[candidate].generation - person.generation) == nearest_distance]
                if len(nearest) == 1:
                    dsu.union(nearest[0], raw_id)

        # Duplicate branches copied beneath both members of a marriage collapse
        # only when name, generation, and the expanded parent union all agree.
        changed = True
        while changed:
            changed = False
            canonical_spouses: dict[str, set[str]] = defaultdict(set)
            for left, right, _ in self.spouse_edges:
                left_root = dsu.find(left)
                right_root = dsu.find(right)
                canonical_spouses[left_root].add(right_root)
                canonical_spouses[right_root].add(left_root)
            groups: dict[tuple[str, tuple[str, ...]], list[str]] = defaultdict(list)
            for raw_id, person in self.people.items():
                if not person.structural:
                    continue
                expanded_parents: set[str] = set()
                for parent in parents_by_child.get(raw_id, set()):
                    parent_root = dsu.find(parent)
                    expanded_parents.add(parent_root)
                    expanded_parents.update(canonical_spouses.get(parent_root, set()))
                if not expanded_parents:
                    continue
                signature = (identity(person.name), tuple(sorted(expanded_parents)))
                groups[signature].append(raw_id)
            for members in groups.values():
                for member in members[1:]:
                    changed = dsu.union(members[0], member) or changed

        # Partner-only nodes repeated in copied pages are the same person when
        # their name and canonical spouse are the same.
        partner_groups: dict[tuple[int, str, tuple[str, ...]], list[str]] = defaultdict(list)
        for raw_id, person in self.people.items():
            if person.structural:
                continue
            canonical_spouses = tuple(
                sorted(identity(self.people[spouse].name) for spouse in spouses_by_person.get(raw_id, set()))
            )
            partner_groups[(person.generation, identity(person.name), canonical_spouses)].append(raw_id)
        for members in partner_groups.values():
            for member in members[1:]:
                dsu.union(members[0], member)
        return dsu

    def choose_name(self, aliases: set[str]) -> str:
        candidates = [remove_years(remove_marker(alias)[1]) for alias in aliases if not is_placeholder(alias)]
        if not candidates:
            return "Unknown"
        def score(value: str) -> tuple[int, int, int]:
            code_penalty = int(bool(re.search(r"\bx[a-z0-9_]*\b", value, flags=re.I)))
            return (-code_penalty, len(value.split()), len(value))
        return max(candidates, key=score)

    def canonical_data(self, dsu: DSU) -> dict:
        groups: dict[str, list[Person]] = defaultdict(list)
        for raw_id, person in self.people.items():
            groups[dsu.find(raw_id)].append(person)
        ordered_groups = sorted(groups.values(), key=lambda group: (min(item.generation for item in group), self.choose_name(set().union(*(item.aliases for item in group)))))
        canonical_id: dict[str, str] = {}
        people: list[dict] = []
        for index, group in enumerate(ordered_groups, 1):
            person_id = f"p{index}"
            aliases = set().union(*(item.aliases for item in group))
            sources = set().union(*(item.sources for item in group))
            name = self.choose_name(aliases)
            birth_candidates = sorted({item.birth_year for item in group if item.birth_year})
            death_candidates = sorted({item.death_year for item in group if item.death_year})
            people.append({
                "id": person_id,
                "name": name,
                "generation": max(item.generation for item in group),
                "birthYear": birth_candidates[0] if birth_candidates else None,
                "deathYear": death_candidates[0] if death_candidates else None,
                "aliases": sorted(alias for alias in aliases if normal(alias) != normal(name)),
                "branches": sorted({item.branch for item in group if not item.branch.startswith("partner:")}),
                "sources": sorted(sources),
                "confidence": "high" if any(item.structural for item in group) else "medium",
            })
            for item in group:
                canonical_id[item.raw_id] = person_id

        relationship_keys: set[tuple[str, str, str]] = set()
        relationships: list[dict] = []
        for parent, child, source in self.parent_edges:
            parent_id = canonical_id[parent]
            child_id = canonical_id[child]
            if parent_id == child_id:
                continue
            key = ("parent", parent_id, child_id)
            if key in relationship_keys:
                continue
            relationship_keys.add(key)
            relationships.append({"type": "parent", "from": parent_id, "to": child_id, "source": source})
        for left, right, source in self.spouse_edges:
            left_id = canonical_id[left]
            right_id = canonical_id[right]
            if left_id == right_id:
                continue
            left_id, right_id = sorted((left_id, right_id))
            key = ("spouse", left_id, right_id)
            if key in relationship_keys:
                continue
            relationship_keys.add(key)
            relationships.append({"type": "spouse", "from": left_id, "to": right_id, "source": source})

        # When a child has only one recorded parent and that parent has one
        # unambiguous spouse, the copied table is asserting a two-parent union.
        parent_map: dict[str, set[str]] = defaultdict(set)
        spouse_map: dict[str, set[str]] = defaultdict(set)
        people_by_id = {person["id"]: person for person in people}
        for relation in relationships:
            if relation["type"] == "parent":
                parent_map[relation["to"]].add(relation["from"])
            else:
                spouse_map[relation["from"]].add(relation["to"])
                spouse_map[relation["to"]].add(relation["from"])
        inferred: list[dict] = []
        for child, recorded_parents in list(parent_map.items()):
            if len(recorded_parents) != 1:
                continue
            parent = next(iter(recorded_parents))
            spouses = spouse_map.get(parent, set())
            if len(spouses) != 1:
                continue
            other_parent = next(iter(spouses))
            if people_by_id[other_parent]["generation"] >= people_by_id[child]["generation"]:
                continue
            key = ("parent", other_parent, child)
            if key in relationship_keys:
                continue
            relationship_keys.add(key)
            inferred.append({"type": "parent", "from": other_parent, "to": child, "source": "inferred from sole recorded spouse", "inferred": True})
        relationships.extend(inferred)

        # Generation numbers in the old archive are branch-relative. A child
        # of cousins from adjacent branch generations can therefore be labeled
        # both 8 and 9. Preserve the highest recorded label, then raise any
        # child necessary to maintain a valid parent-before-child layout.
        for _ in range(len(people)):
            changed = False
            for relation in relationships:
                if relation["type"] != "parent":
                    continue
                parent = people_by_id[relation["from"]]
                child = people_by_id[relation["to"]]
                required = parent["generation"] + 1
                if child["generation"] < required:
                    child["generation"] = required
                    changed = True
            if not changed:
                break
        else:
            raise RuntimeError("Parent graph contains a generation cycle")

        complex_marriages = self.detect_related_spouses(people_by_id, relationships)
        return {
            "people": people,
            "relationships": relationships,
            "complexMarriages": complex_marriages,
            "meta": {
                "sourceArchive": "Darabi_Family_Tree_RD.zip",
                "sourceFiles": len([path for path in self.root.rglob("*") if path.is_file()]),
                "htmlPages": len(self.node_by_file),
                "placeholderEntriesSkipped": self.placeholder_count,
                "ambiguousIdentityWarnings": sorted(set(self.ambiguous)),
            },
        }

    def detect_related_spouses(self, people: dict[str, dict], relationships: list[dict]) -> list[dict]:
        parents: dict[str, set[str]] = defaultdict(set)
        marriages: set[tuple[str, str]] = set()
        for relation in relationships:
            if relation["type"] == "parent":
                parents[relation["to"]].add(relation["from"])
            elif relation["type"] == "spouse":
                marriages.add(tuple(sorted((relation["from"], relation["to"]))))

        def ancestors(person: str) -> dict[str, int]:
            result: dict[str, int] = {}
            queue = deque((parent, 1) for parent in parents.get(person, set()))
            while queue:
                ancestor, distance = queue.popleft()
                if ancestor in result and result[ancestor] <= distance:
                    continue
                result[ancestor] = distance
                queue.extend((parent, distance + 1) for parent in parents.get(ancestor, set()))
            return result

        related: list[dict] = []
        for left, right in sorted(marriages):
            left_ancestors = ancestors(left)
            right_ancestors = ancestors(right)
            common = set(left_ancestors) & set(right_ancestors)
            if not common:
                continue
            nearest = min(common, key=lambda ancestor: (max(left_ancestors[ancestor], right_ancestors[ancestor]), left_ancestors[ancestor] + right_ancestors[ancestor]))
            left_distance = left_ancestors[nearest]
            right_distance = right_ancestors[nearest]
            if left_distance == right_distance:
                degree = left_distance - 1
                if degree == 0:
                    relation_label = "siblings"
                elif degree == 1:
                    relation_label = "first cousins"
                elif degree == 2:
                    relation_label = "second cousins"
                elif degree == 3:
                    relation_label = "third cousins"
                else:
                    relation_label = f"{degree}th cousins"
            else:
                relation_label = "cousins in different generations"
            related.append({
                "left": left,
                "right": right,
                "relationship": relation_label,
                "commonAncestor": nearest,
                "evidence": f"shared ancestor {people[nearest]['name']}",
            })
        return related


def extract_plain_html(path: Path) -> str:
    parser = TableParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    filtered = []
    for item in parser.all_text:
        if item.startswith("<!--") or re.match(r"^[.#][a-zA-Z]", item):
            continue
        filtered.append(item)
    return "\n".join(filtered)


def extract_documents(root: Path) -> list[dict]:
    documents: list[dict] = []
    narrative_html = ["A_Introduction.html", "B_Family_Biography_English.html", "B_Family_Biography.html"]
    for relative in narrative_html:
        path = root / relative
        if path.exists():
            documents.append({"title": path.stem.replace("_", " "), "source": relative, "text": extract_plain_html(path)})
    for path in sorted(list((root / "Divers_docs").glob("*")) + list((root / "Mohmmad_Darabi_HISTORIES").glob("*"))):
        if path.suffix.lower() not in {".doc", ".docx", ".rtf"}:
            continue
        text = ""
        if shutil.which("textutil"):
            result = subprocess.run(["textutil", "-convert", "txt", "-stdout", str(path)], capture_output=True, check=False)
            text = result.stdout.decode("utf-8", errors="replace")
        if text.strip():
            relative = path.relative_to(root)
            documents.append({
                "title": readable_archive_name(path.stem).replace("_", " "),
                "source": readable_source(relative),
                "text": collapse(text),
            })
    return documents


def extract_images(root: Path, people: list[dict]) -> list[dict]:
    images: list[dict] = []
    supported = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in supported:
            continue
        relative = path.relative_to(root)
        title = readable_archive_name(path.stem).replace("_", " ")
        generation_match = re.match(r"^G(\d+)\s+", title, re.IGNORECASE)
        generation_hint = int(generation_match.group(1)) if generation_match else None
        matching_title = re.sub(r"^G\d+\s+", "", title, flags=re.IGNORECASE)
        matching_title = re.sub(r"\s+Family$", "", matching_title, flags=re.IGNORECASE)
        person_ids = [
            person["id"]
            for person in people
            if probable_name_match(person["name"], matching_title)
            and (generation_hint is None or person["generation"] == generation_hint)
        ]
        mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        images.append({
            "title": title,
            "source": readable_source(relative),
            "mimeType": mime_type,
            "size": path.stat().st_size,
            "personIds": person_ids,
            "dataUrl": f"data:{mime_type};base64,{encoded}",
        })
    return images


def render_html(data: dict, documents: list[dict], images: list[dict]) -> str:
    payload = json.dumps({**data, "documents": documents, "images": images}, ensure_ascii=False).replace("</", "<\\/")
    template = """<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>Darabi family — reconstructed archive</title>
  <style>
    :root{{--ink:#1d1d1f;--muted:#6e6e73;--line:#c7c7cc;--parent:#3c7cf4;--marriage:#a07045;--paper:#f5f5f7;--card:#fff;--sidebar:360px}}
    *{{box-sizing:border-box}} html,body{{height:100%;margin:0}} body{{font:15px/1.45 -apple-system,BlinkMacSystemFont,\"SF Pro Text\",Inter,Arial,sans-serif;color:var(--ink);background:var(--paper);overflow:hidden}}
    button,input,select{{font:inherit}} button{{cursor:pointer}}
    header{{height:64px;display:flex;align-items:center;gap:20px;padding:0 22px;border-bottom:1px solid #d8d8dc;background:rgba(250,250,252,.92);backdrop-filter:blur(24px);position:relative;z-index:20}}
    h1{{font-size:18px;margin:0;white-space:nowrap}} .stats{{color:var(--muted);font-size:13px}} .controls{{margin-left:auto;display:flex;gap:8px;align-items:center}}
    input,select,.control{{height:38px;border:1px solid #d1d1d6;border-radius:10px;background:white;padding:0 12px}} input{{width:260px}}
    #shell{{height:calc(100% - 64px);display:grid;grid-template-columns:1fr var(--sidebar)}}
    #viewport{{position:relative;overflow:hidden;background:radial-gradient(circle at 50% 35%,#fff 0,#f4f7f5 44%,#edf2ef 100%);touch-action:none;cursor:grab}}
    #viewport.dragging{{cursor:grabbing}} #world{{position:absolute;transform-origin:0 0}} #edges,#nodes{{position:absolute;left:0;top:0}} #edges{{overflow:visible;pointer-events:none}}
    .node{{position:absolute;width:210px;min-height:74px;padding:12px 14px 11px 58px;border:1px solid #d4d4d8;border-radius:14px;background:rgba(255,255,255,.96);box-shadow:0 10px 24px rgba(30,45,38,.10);text-align:left;color:var(--ink)}}
    .node:hover,.node.selected{{border-color:#1473e6;box-shadow:0 0 0 3px rgba(20,115,230,.18),0 13px 28px rgba(30,45,38,.14)}} .avatar{{position:absolute;left:12px;top:13px;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#e4eee4;color:#2e7348;font:19px Georgia,serif}}
    .node strong{{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}} .node small{{display:block;color:var(--muted);margin-top:3px}}
    .generation-label{{position:absolute;color:#8a8a8f;font-size:12px;font-weight:650;letter-spacing:.08em;text-transform:uppercase}}
    aside{{border-left:1px solid #d8d8dc;background:rgba(250,250,248,.96);overflow:auto;padding:24px;position:relative;z-index:15}}
    aside h2{{font:30px/1.1 Georgia,serif;margin:0 0 8px}} aside h3{{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#74747a;margin:28px 0 9px}} aside p{{margin:0 0 12px}} .empty{{height:100%;display:grid;place-content:center;color:var(--muted);text-align:center}}
    .pills{{display:flex;flex-wrap:wrap;gap:6px}} .pill{{border:1px solid #d1d1d6;background:white;border-radius:999px;padding:5px 9px;font-size:13px}} .pill:hover{{border-color:#1473e6}}
    .zoom{{position:absolute;right:18px;bottom:18px;z-index:10;display:flex;align-items:center;background:white;border:1px solid #d4d4d8;border-radius:11px;box-shadow:0 8px 22px rgba(0,0,0,.1);overflow:hidden}} .zoom button{{border:0;background:white;width:38px;height:38px;font-size:20px}} .zoom span{{min-width:56px;text-align:center;font-size:13px}}
    .legend{{position:absolute;left:18px;bottom:18px;z-index:10;background:rgba(255,255,255,.9);border:1px solid #ddd;border-radius:10px;padding:9px 11px;font-size:12px;color:var(--muted)}} .swatch{{display:inline-block;width:20px;height:3px;vertical-align:middle;margin:0 5px 0 10px;background:var(--parent)}} .swatch.marriage{{background:var(--marriage)}}
    dialog{{width:min(760px,calc(100% - 32px));max-height:80vh;border:0;border-radius:18px;padding:0;box-shadow:0 28px 90px rgba(0,0,0,.25)}} dialog::backdrop{{background:rgba(0,0,0,.28)}} .docs{{padding:24px;max-height:80vh;overflow:auto}} details{{border-top:1px solid #ddd;padding:14px 0}} summary{{font-weight:650;cursor:pointer}} pre{{white-space:pre-wrap;font:13px/1.55 -apple-system,BlinkMacSystemFont,sans-serif;color:#444}}
    .gallery{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:16px 0 28px}} .gallery figure{{margin:0}} .gallery img{{width:100%;height:150px;object-fit:cover;border-radius:12px;background:#eee}} .gallery figcaption{{font-size:12px;color:var(--muted);margin-top:6px}} .person-photo{{display:block;width:100%;max-height:280px;object-fit:contain;border-radius:14px;background:#ececec;margin:18px 0}}
    @media(max-width:850px){{:root{{--sidebar:300px}} .stats{{display:none}} input{{width:180px}}}}
    @media(max-width:650px){{header{{height:auto;min-height:64px;flex-wrap:wrap;padding:12px}} .controls{{width:100%;margin:0}} input{{flex:1;width:auto}} #shell{{height:calc(100% - 112px);grid-template-columns:1fr}} aside{{position:absolute;right:0;top:112px;bottom:0;width:min(88vw,360px);box-shadow:-14px 0 40px rgba(0,0,0,.15)}}}}
  </style>
</head>
<body>
  <header>
    <h1>Darabi family — reconstructed archive</h1>
    <span class=\"stats\" id=\"stats\"></span>
    <div class=\"controls\">
      <input id=\"search\" type=\"search\" placeholder=\"Find a person\" aria-label=\"Find a person\">
      <select id=\"branch\" aria-label=\"Choose a branch\"><option value=\"all\">Entire family</option></select>
      <button class=\"control\" id=\"stories\">Archive notes</button>
    </div>
  </header>
  <div id=\"shell\">
    <main id=\"viewport\" aria-label=\"Interactive family tree\">
      <div id=\"world\"><svg id=\"edges\"></svg><div id=\"nodes\"></div></div>
      <div class=\"legend\">Drag to pan · scroll to zoom <i class=\"swatch\"></i> parent <i class=\"swatch marriage\"></i> marriage</div>
      <div class=\"zoom\"><button id=\"out\" aria-label=\"Zoom out\">−</button><span id=\"percent\">100%</span><button id=\"in\" aria-label=\"Zoom in\">+</button><button id=\"fit\" aria-label=\"Fit tree\">⌂</button></div>
    </main>
    <aside id=\"details\"><div class=\"empty\"><div><strong>Select a person</strong><br>See their recorded family connections and sources.</div></div></aside>
  </div>
  <dialog id=\"documents\"><div class=\"docs\"><button class=\"control\" style=\"float:right\" onclick=\"documents.close()\">Done</button><h2>Archive notes, histories, and photographs</h2><p>Material preserved from the legacy HTML, Word, RTF, and image files.</p><div class=\"gallery\" id=\"image-gallery\"></div><div id=\"document-list\"></div></div></dialog>
  <script>
  const DATA=__DARABI_ARCHIVE_PAYLOAD__;
  const byId=new Map(DATA.people.map(person=>[person.id,person]));
  const parents=new Map(),children=new Map(),spouses=new Map();
  function add(map,key,value){{if(!map.has(key))map.set(key,new Set());map.get(key).add(value)}}
  DATA.relationships.forEach(relation=>{{if(relation.type==='parent'){{add(children,relation.from,relation.to);add(parents,relation.to,relation.from)}}else{{add(spouses,relation.from,relation.to);add(spouses,relation.to,relation.from)}}}});
  const branchSelect=document.querySelector('#branch');
  [...new Set(DATA.people.flatMap(person=>person.branches))].filter(branch=>branch&&branch!=='early'&&branch!=='archive').sort().forEach(branch=>branchSelect.add(new Option(`${{branch}} branch`,branch)));
  document.querySelector('#stats').textContent=`${{DATA.people.length}} people · ${{DATA.relationships.filter(r=>r.type==='parent').length}} parent links · ${{DATA.relationships.filter(r=>r.type==='spouse').length}} marriages`;
  const viewport=document.querySelector('#viewport'),world=document.querySelector('#world'),nodeLayer=document.querySelector('#nodes'),svg=document.querySelector('#edges'),details=document.querySelector('#details');
  let scale=.72,offsetX=80,offsetY=50,selected=null,layout=new Map(),worldWidth=1800,worldHeight=1800;
  const CARD_W=210,CARD_H=74,X_GAP=46,Y_GAP=190;
  function relativesOfBranch(branch){{if(branch==='all')return new Set(DATA.people.map(p=>p.id));const seeds=DATA.people.filter(p=>p.branches.includes(branch)).map(p=>p.id);const visible=new Set(seeds);let changed=true;while(changed){{changed=false;for(const id of [...visible]){{for(const linked of [...(parents.get(id)||[]),...(children.get(id)||[]),...(spouses.get(id)||[])])if(!visible.has(linked)){{visible.add(linked);changed=true}}}}}}return visible}}
  function render(){{
    const visible=relativesOfBranch(branchSelect.value);const groups=new Map();for(const person of DATA.people){{if(!visible.has(person.id))continue;if(!groups.has(person.generation))groups.set(person.generation,[]);groups.get(person.generation).push(person)}}
    const generations=[...groups.keys()].sort((a,b)=>a-b);layout=new Map();let maxCount=1;
    for(const generation of generations){{const row=groups.get(generation);row.sort((a,b)=>{{const ap=[...(parents.get(a.id)||[])].map(id=>byId.get(id)?.name||'').sort().join('|');const bp=[...(parents.get(b.id)||[])].map(id=>byId.get(id)?.name||'').sort().join('|');return ap.localeCompare(bp)||a.name.localeCompare(b.name)}});maxCount=Math.max(maxCount,row.length)}}
    worldWidth=Math.max(1500,maxCount*(CARD_W+X_GAP)+180);worldHeight=Math.max(900,generations.length*Y_GAP+180);
    for(const generation of generations){{const row=groups.get(generation);const width=row.length*(CARD_W+X_GAP)-X_GAP;let x=(worldWidth-width)/2;row.forEach(person=>{{layout.set(person.id,{{x,y:70+(generation-generations[0])*Y_GAP}});x+=CARD_W+X_GAP}})}}
    nodeLayer.innerHTML='';svg.innerHTML='';svg.setAttribute('width',worldWidth);svg.setAttribute('height',worldHeight);nodeLayer.style.width=worldWidth+'px';nodeLayer.style.height=worldHeight+'px';
    for(const generation of generations){{const first=groups.get(generation)[0];if(!first)continue;const label=document.createElement('div');label.className='generation-label';label.textContent=`Generation ${{generation}}`;label.style.left='18px';label.style.top=(layout.get(first.id).y+26)+'px';nodeLayer.append(label)}}
    const drawnSpouses=new Set();for(const person of DATA.people){{if(!visible.has(person.id)||!layout.has(person.id))continue;for(const spouse of spouses.get(person.id)||[]){{if(!visible.has(spouse)||!layout.has(spouse))continue;const key=[person.id,spouse].sort().join('|');if(drawnSpouses.has(key))continue;drawnSpouses.add(key);line(layout.get(person.id).x+CARD_W/2,layout.get(person.id).y+CARD_H/2,layout.get(spouse).x+CARD_W/2,layout.get(spouse).y+CARD_H/2,'marriage')}}}
    for(const [childId,parentIds] of parents){{if(!visible.has(childId)||!layout.has(childId))continue;const available=[...parentIds].filter(id=>visible.has(id)&&layout.has(id));if(!available.length)continue;const child=layout.get(childId);const centers=available.map(id=>layout.get(id).x+CARD_W/2);const unionX=centers.reduce((sum,x)=>sum+x,0)/centers.length;const parentY=Math.max(...available.map(id=>layout.get(id).y+CARD_H));const childX=child.x+CARD_W/2;const childY=child.y;const midY=(parentY+childY)/2;path(`M ${{unionX}} ${{parentY}} V ${{midY}} H ${{childX}} V ${{childY}}`,'parent')}}
    for(const person of DATA.people){{const point=layout.get(person.id);if(!point)continue;const button=document.createElement('button');button.className='node'+(selected===person.id?' selected':'');button.style.left=point.x+'px';button.style.top=point.y+'px';button.dataset.id=person.id;button.innerHTML=`<span class=\"avatar\">${{escapeHtml(person.name.charAt(0))}}</span><strong>${{escapeHtml(person.name)}}</strong><small>${{life(person)}}</small>`;button.onclick=()=>select(person.id,true);nodeLayer.append(button)}}
    applyTransform();
  }}
  function line(x1,y1,x2,y2,type){{path(`M ${{x1}} ${{y1}} L ${{x2}} ${{y2}}`,type)}}
  function path(d,type){{const element=document.createElementNS('http://www.w3.org/2000/svg','path');element.setAttribute('d',d);element.setAttribute('fill','none');element.setAttribute('stroke',type==='marriage'?'#a07045':'#3c7cf4');element.setAttribute('stroke-width',type==='marriage'?'3':'2.5');if(type==='marriage')element.setAttribute('stroke-dasharray','7 5');element.setAttribute('stroke-linejoin','round');svg.append(element)}}
  function life(person){{if(person.birthYear&&person.deathYear)return `${{person.birthYear}}–${{person.deathYear}}`;if(person.birthYear)return `Born ${{person.birthYear}}`;return `Generation ${{person.generation}}`}}
  function escapeHtml(value){{return String(value).replace(/[&<>\"]/g,char=>({{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}}[char]))}}
  function relationshipPills(ids){{return [...ids].map(id=>`<button class=\"pill\" data-person=\"${{id}}\">${{escapeHtml(byId.get(id).name)}}</button>`).join('')}}
  function select(id,center=false){{selected=id;document.querySelectorAll('.node').forEach(node=>node.classList.toggle('selected',node.dataset.id===id));const person=byId.get(id);const photo=DATA.images.find(image=>image.personIds.includes(id));details.innerHTML=`<h2>${{escapeHtml(person.name)}}</h2><p>${{life(person)}} · Generation ${{person.generation}}</p>${{photo?`<img class=\"person-photo\" src=\"${{photo.dataUrl}}\" alt=\"${{escapeHtml(photo.title)}}\">`:''}}${{person.aliases.length?`<p><small>Also recorded as ${{person.aliases.map(escapeHtml).join(', ')}}</small></p>`:''}}<h3>Parents</h3><div class=\"pills\">${{relationshipPills(parents.get(id)||[])||'<span>Not recorded</span>'}}</div><h3>Spouses</h3><div class=\"pills\">${{relationshipPills(spouses.get(id)||[])||'<span>Not recorded</span>'}}</div><h3>Children</h3><div class=\"pills\">${{relationshipPills(children.get(id)||[])||'<span>None recorded</span>'}}</div><h3>Evidence</h3><p>${{person.sources.length}} source file${{person.sources.length===1?'':'s'}} · ${{person.confidence}} structural confidence</p>`;details.querySelectorAll('[data-person]').forEach(button=>button.onclick=()=>select(button.dataset.person,true));if(center)centerOn(id)}}
  function centerOn(id){{const point=layout.get(id);if(!point)return;offsetX=viewport.clientWidth/2-(point.x+CARD_W/2)*scale;offsetY=viewport.clientHeight/2-(point.y+CARD_H/2)*scale;applyTransform()}}
  function applyTransform(){{world.style.transform=`translate(${{offsetX}}px,${{offsetY}}px) scale(${{scale}})`;document.querySelector('#percent').textContent=Math.round(scale*100)+'%'}}
  function zoomTo(next,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){{next=Math.max(.18,Math.min(2,next));const wx=(cx-offsetX)/scale,wy=(cy-offsetY)/scale;offsetX=cx-wx*next;offsetY=cy-wy*next;scale=next;applyTransform()}}
  function fit(){{scale=Math.min(.9,(viewport.clientWidth-80)/worldWidth,(viewport.clientHeight-80)/worldHeight);offsetX=(viewport.clientWidth-worldWidth*scale)/2;offsetY=(viewport.clientHeight-worldHeight*scale)/2;applyTransform()}}
  let dragging=false,lastX=0,lastY=0;viewport.addEventListener('pointerdown',event=>{{if(event.target.closest('button'))return;dragging=true;lastX=event.clientX;lastY=event.clientY;viewport.classList.add('dragging');viewport.setPointerCapture(event.pointerId)}});viewport.addEventListener('pointermove',event=>{{if(!dragging)return;offsetX+=event.clientX-lastX;offsetY+=event.clientY-lastY;lastX=event.clientX;lastY=event.clientY;applyTransform()}});viewport.addEventListener('pointerup',()=>{{dragging=false;viewport.classList.remove('dragging')}});viewport.addEventListener('wheel',event=>{{event.preventDefault();zoomTo(scale*Math.exp(-event.deltaY*.0015),event.clientX-viewport.getBoundingClientRect().left,event.clientY-viewport.getBoundingClientRect().top)}},{{passive:false}});
  document.querySelector('#in').onclick=()=>zoomTo(scale*1.2);document.querySelector('#out').onclick=()=>zoomTo(scale/1.2);document.querySelector('#fit').onclick=fit;branchSelect.onchange=()=>{{selected=null;render();fit()}};
  document.querySelector('#search').addEventListener('input',event=>{{const query=normalise(event.target.value);if(!query)return;const person=DATA.people.find(item=>normalise(item.name).includes(query)||item.aliases.some(alias=>normalise(alias).includes(query)));if(person)select(person.id,true)}});function normalise(value){{return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim()}}
  const documentsDialog=document.querySelector('#documents'),documentList=document.querySelector('#document-list'),imageGallery=document.querySelector('#image-gallery');document.querySelector('#stories').onclick=()=>documentsDialog.showModal();imageGallery.innerHTML=DATA.images.map(image=>`<figure><img src=\"${{image.dataUrl}}\" alt=\"${{escapeHtml(image.title)}}\"><figcaption>${{escapeHtml(image.title)}} · ${{escapeHtml(image.source)}}</figcaption></figure>`).join('');documentList.innerHTML=DATA.documents.map(document=>`<details><summary>${{escapeHtml(document.title)}}</summary><small>${{escapeHtml(document.source)}}</small><pre>${{escapeHtml(document.text)}}</pre></details>`).join('');
  render();requestAnimationFrame(fit);
  </script>
</body>
</html>"""
    # The template was authored with doubled braces so it remains readable
    # beside Python formatting code. Collapse those braces before inserting
    # archive text, whose contents must remain byte-for-byte unchanged.
    template = template.replace("{{", "{").replace("}}", "}")
    return template.replace("__DARABI_ARCHIVE_PAYLOAD__", payload)


def render_report(data: dict, documents: list[dict], images: list[dict]) -> str:
    people = data["people"]
    relationships = data["relationships"]
    parents = [item for item in relationships if item["type"] == "parent"]
    spouses = [item for item in relationships if item["type"] == "spouse"]
    duplicate_names: dict[str, list[dict]] = defaultdict(list)
    for person in people:
        duplicate_names[normal(person["name"])].append(person)
    collisions = {name: group for name, group in duplicate_names.items() if len(group) > 1}
    lines = [
        "# Legacy Darabi family-tree extraction report",
        "",
        "The source ZIP was read without modifying it. Directory ancestry, HTML generation rows, explicit hyperlinks, spouse columns, dates, and narrative documents were treated as separate evidence channels.",
        "",
        "## Reconstructed graph",
        "",
        f"- {len(people)} distinct people",
        f"- {len(parents)} parent/child relationships",
        f"- {len(spouses)} marriages or spouse relationships",
        f"- {len(documents)} narrative documents preserved as searchable text",
        f"- {len(images)} archive photographs preserved in the standalone HTML",
        f"- {data['meta']['placeholderEntriesSkipped']} placeholder entries (`Xxx`, `Yyy`, `---`, and similar) omitted",
        f"- {len(data['complexMarriages'])} marriages connect people with a recorded common ancestor",
        "",
        "## Complicated or cross-branch marriages",
        "",
    ]
    people_by_id = {person["id"]: person for person in people}
    if data["complexMarriages"]:
        for item in data["complexMarriages"]:
            lines.append(f"- {people_by_id[item['left']]['name']} and {people_by_id[item['right']]['name']}: {item['relationship']} ({item['evidence']}).")
    else:
        lines.append("- None detected from the recorded parent graph.")
    lines.extend(["", "## Same-name identities kept separate", ""])
    if collisions:
        for group in sorted(collisions.values(), key=lambda items: items[0]["name"]):
            lines.append(f"- {group[0]['name']}: {len(group)} structurally distinct people")
    else:
        lines.append("- None.")
    lines.extend(["", "## Unresolved evidence", ""])
    if data["meta"]["ambiguousIdentityWarnings"]:
        lines.extend(f"- {warning}" for warning in data["meta"]["ambiguousIdentityWarnings"])
    else:
        lines.append("- No unresolved same-generation structural identity matches.")
    lines.extend([
        "",
        "## Interpretation rules",
        "",
        "- A folder ending in `_G7`, `_G8`, or `_G9` names the person whose descendants are stored below it; the suffix is the next generation shown by that folder.",
        "- Adjacent nested person folders are parent and child.",
        "- A person followed by one or more `xlname2` cells in a generation row is married to those adjacent names.",
        "- `(1)` and `(2)` markers associate children with the corresponding marriage when multiple spouses are recorded.",
        "- A copied descendant branch beneath both spouses is merged only when person name and expanded parent union agree; branch-relative generation labels are retained as evidence but do not create duplicate identities.",
        "- When the two spouse branches assign different generation numbers to the same child, the layout uses the highest recorded number and then enforces parent-before-child order.",
        "- Placeholder people and placeholder children are not converted into records.",
        "- Every inferred second parent is marked in JSON with `inferred: true` and is made only when one spouse is recorded.",
        "",
        "## Output files",
        "",
        "- `public/legacy-family-tree.html`: standalone interactive tree, document browser, and photograph archive",
        "- `public/legacy-family-tree-data.json`: normalized people and relationships",
        "- `docs/legacy-family-tree-import-report.md`: this audit report",
        "- `scripts/extract_legacy_family_tree.py`: reproducible extractor",
        "",
        "This is an evidence-preserving reconstruction, not a claim that every source statement is factually correct. The original archive itself says it may contain errors.",
    ])
    return "\n".join(lines) + "\n"


def find_root(extracted: Path) -> Path:
    candidates = [path for path in extracted.iterdir() if path.is_dir() and path.name != "__MACOSX"]
    if len(candidates) == 1:
        return candidates[0]
    if (extracted / "Darabi_Family_Tree_RD").is_dir():
        return extracted / "Darabi_Family_Tree_RD"
    raise RuntimeError("Could not identify the archive root")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--html", type=Path, required=True)
    parser.add_argument("--json", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="darabi-legacy-") as temporary:
        extracted = Path(temporary)
        with zipfile.ZipFile(args.archive) as archive:
            archive.extractall(extracted)
        # macOS exposes /var as a symlink to /private/var. Resolve once so
        # every later relative evidence path uses the same canonical prefix.
        root = find_root(extracted).resolve()
        extractor = Extractor(root)
        extractor.add_manual_tree()
        extractor.build_structural_people()
        extractor.extract_relationships()
        dsu = extractor.merge_people()
        data = extractor.canonical_data(dsu)
        documents = extract_documents(root)
        images = extract_images(root, data["people"])
        image_metadata = [{key: value for key, value in image.items() if key != "dataUrl"} for image in images]
        args.html.parent.mkdir(parents=True, exist_ok=True)
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.html.write_text(render_html(data, documents, images), encoding="utf-8")
        args.json.write_text(json.dumps({**data, "documents": documents, "images": image_metadata}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        args.report.write_text(render_report(data, documents, images), encoding="utf-8")
        print(json.dumps({
            "people": len(data["people"]),
            "relationships": len(data["relationships"]),
            "documents": len(documents),
            "images": len(images),
            "complexMarriages": len(data["complexMarriages"]),
            "warnings": len(data["meta"]["ambiguousIdentityWarnings"]),
        }, indent=2))


if __name__ == "__main__":
    main()
