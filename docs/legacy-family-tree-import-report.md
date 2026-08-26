# Legacy Darabi family-tree extraction report

The source ZIP was read without modifying it. Directory ancestry, HTML generation rows, explicit hyperlinks, spouse columns, dates, and narrative documents were treated as separate evidence channels.

## Reconstructed graph

- 418 distinct people
- 466 parent/child relationships
- 141 marriages or spouse relationships
- 14 narrative documents preserved as searchable text
- 9 archive photographs preserved in the standalone HTML
- 26 placeholder entries (`Xxx`, `Yyy`, `---`, and similar) omitted
- 5 marriages connect people with a recorded common ancestor

## Complicated or cross-branch marriages

- Fariba Eftekhari Rad and Abbas Darabi: first cousins (shared ancestor Ramazan Darabi).
- Mehdi Darabiha and Nikoo Abtahi: cousins in different generations (shared ancestor Ghassem Darabi).
- Akhtar Darabi and Gholam Reza Darabi: first cousins (shared ancestor Mohammad Darabi).
- Afshin Khavarian and Marjan Khalaj: second cousins (shared ancestor Ramazan Jaberian).
- Kazem Darabiha and Mehrangiz Darabi: first cousins (shared ancestor Mohammad Darabi).

## Same-name identities kept separate

- Abbas Darabi: 2 structurally distinct people
- Hossein Darabi: 2 structurally distinct people
- Mohammad Darabi: 2 structurally distinct people

## Unresolved evidence

- No unresolved same-generation structural identity matches.

## Interpretation rules

- A folder ending in `_G7`, `_G8`, or `_G9` names the person whose descendants are stored below it; the suffix is the next generation shown by that folder.
- Adjacent nested person folders are parent and child.
- A person followed by one or more `xlname2` cells in a generation row is married to those adjacent names.
- `(1)` and `(2)` markers associate children with the corresponding marriage when multiple spouses are recorded.
- A copied descendant branch beneath both spouses is merged only when person name and expanded parent union agree; branch-relative generation labels are retained as evidence but do not create duplicate identities.
- When the two spouse branches assign different generation numbers to the same child, the layout uses the highest recorded number and then enforces parent-before-child order.
- Placeholder people and placeholder children are not converted into records.
- Every inferred second parent is marked in JSON with `inferred: true` and is made only when one spouse is recorded.

## Output files

- `public/legacy-family-tree.html`: standalone interactive tree, document browser, and photograph archive
- `public/legacy-family-tree-data.json`: normalized people and relationships
- `docs/legacy-family-tree-import-report.md`: this audit report
- `scripts/extract_legacy_family_tree.py`: reproducible extractor

This is an evidence-preserving reconstruction, not a claim that every source statement is factually correct. The original archive itself says it may contain errors.
