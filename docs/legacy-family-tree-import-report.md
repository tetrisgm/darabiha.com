# Legacy Darabi family-tree extraction report

The source ZIP was read without modifying it. Directory nesting, per-family
HTML rows, marriage-order markers, header date lists, and grandchild columns
were treated as separate evidence channels and cross-checked.

## Reconstructed graph

- 407 distinct people
- 543 parent/child relationships (256 second parents inferred from a marriage)
- 137 marriages
- 14 narrative documents preserved as searchable text
- 9 photograph records (8 unique files served beside the page)
- every person is connected: no isolated records, no cycles, nobody with more than two parents

## Complicated or cross-branch marriages

- Afshin Khavarian and Marjan Khalaj: second cousins (shared ancestor Fatemeh Darabi).
- Akhtar Darabi and Gholam Reza Darabi: first cousins (shared ancestor Mohammad Darabi).
- Nikoo Abtahi and Mehdi Darabiha: first cousins once removed (shared ancestor Ghassem Darabi).
- Kazem Darabiha and Mehrangiz Darabi: first cousins (shared ancestor Mohammad Darabi).
- Abbas Darabi and Fariba Eftekhari Rad: first cousins (shared ancestor Ramazan Darabi).

## Same-name identities kept separate

- Abbas Darabi: 2 structurally distinct people (generations 5, 7)
- Ali (Fathollah) Jaberian: 2 structurally distinct people (generations 7, 8)
- Hossein Darabi: 2 structurally distinct people (generations 5, 7)
- Mohammad Darabi: 2 structurally distinct people (generations 4, 6)

## Interpretation rules

- A folder `Name_Gn` holds one person; the people filed inside it are their
  children at generation *n* (so the person is generation *n − 1*).
- Adjacent nested person folders are parent and child; the same child under
  both spouses of a cousin marriage is merged by name plus parent union.
- In family tables, a name cell followed by `xlname2*` cells is a person with
  their spouse(s); `(1)`/`(2)` markers tie children and spouses to a specific
  marriage and are meaningful only within that family.
- Unlabeled `xlnameG6` rows are grandchildren columns; their names and markers
  are harvested, and the folder structure remains the parent/child authority.
- Generation-6 birth/death dates exist only in the header name lists of family
  pages and are harvested from there.
- A second parent is inferred only when the recorded parent has exactly one
  spouse, or a marker names the marriage; inferred links are flagged in JSON.
- Pure placeholders (`Xxx`, `---`) are omitted. Coded names (`xAsJ_17`) are
  kept: the archive uses them for known family members with unrecorded names.
- Spelling variants merge only under strict rules (never Ali/Alireza); the
  variant list is preserved per person under `aliases`.

## Warnings

- none

## Output files

- `public/legacy-family-tree.html`: standalone outline tree, photographs, and archive notes
- `public/legacy-family-tree-data.json`: normalized people and relationships
- `public/legacy-photos/`: photograph files referenced by the page
- `docs/legacy-family-tree-import-report.md`: this audit report
- `scripts/extract_legacy_family_tree.py`: reproducible extractor

This is an evidence-preserving reconstruction, not a claim that every source
statement is factually correct. The original archive itself says it may
contain errors.
