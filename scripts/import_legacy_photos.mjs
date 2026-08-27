#!/usr/bin/env node
// Put the archive's photographs on the family cards.
//
// The legacy archive carries nine images, five of which it associates with a
// named person, and not one of them had ever reached a person record: every
// card in the live tree was portrait-less. This script uploads the ones that
// are genuine portraits to R2 exactly the way the photo endpoint does
// (attachments row + object under evidence/<id>) and points the person's
// photo_attachment_id at it.
//
// Matching is curated rather than fuzzy: each entry names the archive id, the
// expected display name and the expected parents, and the script refuses to
// write unless the live record still matches. Only NULL portraits are filled.
//
// Prepare the inputs by re-running the extractor over the source ZIP (the ZIP
// itself lives in R2 as an evidence attachment):
//   python3 scripts/extract_legacy_family_tree.py archive.zip \
//     --html /tmp/tree.html --json /tmp/data.json --report /tmp/report.md --photos /tmp/photos
//
// Usage: node scripts/import_legacy_photos.mjs --data <data.json> --photos <dir> [--execute]
import { readFile, writeFile, stat, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

const TREE_URL = "https://darabiha.com/api/tree";
const BUCKET = "darabiha-family-files";
const ACTOR = "ramine@ramine.net";
const OUT_SQL = "scripts/import_legacy_photos.generated.sql";
const MAX_EDGE = 1400; // the archive keeps the originals; cards get a web-sized copy
const q = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

// archive person id -> the live person it must match before anything is written.
// group:true marks an image the archive files under a person's name that is
// really a family group photograph. The owner asked for them on the cards
// anyway (2026-08-27) - they are the only pictures the archive has of those
// three people. A card crops to a square, and a centred crop of a tall holiday
// photo lands on sky, so each group photo carries a hand-picked square around
// the people: crop = [offsetY, offsetX, size] in the original's pixels.
const EXPECTED = new Map([
  ["p7", { name: "Abbas Darabi", parents: ["Mohammad Zehtab Darabi", "Salmeh"] }],
  ["p11", { name: "Hossein Zehtab Darabi", parents: ["Mohammad Zehtab Darabi", "Salmeh"] }],
  ["p29", { name: "Kazem Darabiha", parents: ["Ghassem Darabi", "Robabeh Masoudi"], group: true, crop: [0, 52, 920] }],
  ["p39", { name: "Nasser Darabiha", parents: ["Ghassem Darabi", "Robabeh Masoudi"], group: true, crop: [1950, 469, 2082] }],
  ["p211", { name: "Niloufar Hashemzad Forouzan", parents: ["Nasrin (Kobra) Darabiha", "Saeed (Asghar) Hashemzad Forouzan"], group: true, crop: [600, 431, 2020] }],
]);

const arg = (flag) => { const index = process.argv.indexOf(flag); return index === -1 ? null : process.argv[index + 1]; };
const dataPath = arg("--data");
const photoDir = arg("--photos");
if (!dataPath || !photoDir) { console.error("Usage: import_legacy_photos.mjs --data <data.json> --photos <dir> [--execute]"); process.exit(1); }

const archive = JSON.parse(await readFile(dataPath, "utf8"));
const tree = await (await fetch(TREE_URL)).json();
const byId = new Map(tree.people.map((person) => [person.id, person]));
const parentsOf = new Map();
for (const link of tree.relationships) {
  if (link.type !== "parent") continue;
  parentsOf.set(link.toPersonId, [...(parentsOf.get(link.toPersonId) ?? []), link.fromPersonId]);
}
const resolve = (archiveId) => {
  const expected = EXPECTED.get(archiveId);
  if (!expected) return { skip: `no curated mapping for ${archiveId}` };
  const matches = tree.people.filter((person) => {
    if (person.displayName !== expected.name) return false;
    const parents = (parentsOf.get(person.id) ?? []).map((id) => byId.get(id)?.displayName).filter(Boolean).sort();
    return JSON.stringify(parents) === JSON.stringify([...expected.parents].sort());
  });
  if (matches.length !== 1) return { skip: `${expected.name} matched ${matches.length} live records` };
  if (matches[0].photoAttachmentId && !(process.argv.includes("--replace") && expected.crop)) return { skip: `${expected.name} already has a portrait` };
  return { person: matches[0] };
};

const work = [];
const skipped = [];
for (const image of archive.images) {
  if (!image.personIds?.length) { skipped.push(`${image.title}: no person recorded in the archive`); continue; }
  for (const archiveId of image.personIds) {
    const { person, skip } = resolve(archiveId);
    if (!person) { skipped.push(`${image.title}: ${skip}`); continue; }
    const source = join(photoDir, basename(image.file));
    const size = (await stat(source)).size;
    work.push({ image, person, source, size, archiveId, attachmentId: randomUUID() });
  }
}

console.log(`Portraits to attach: ${work.length}`);
for (const item of work) console.log(`  ${item.person.displayName.padEnd(30)} <- ${item.image.title} (${Math.round(item.size / 1024)} KB)${EXPECTED.get(item.archiveId)?.group ? " [group photograph]" : ""}`);
if (skipped.length) { console.log("\nLeft off the cards:"); for (const line of skipped) console.log("  " + line); }
if (!work.length) process.exit(0);

const scratch = await mkdtemp(join(tmpdir(), "darabiha-photos-"));
const statements = [];
const now = new Date().toISOString();
for (const item of work) {
  // sips ships with macOS; the cropped, resized copy is what the cards load
  const resized = join(scratch, `${item.attachmentId}.jpg`);
  const crop = EXPECTED.get(item.archiveId)?.crop;
  let source = item.source;
  if (crop) {
    const cropped = join(scratch, `${item.attachmentId}-crop.jpg`);
    execFileSync("sips", ["-c", String(crop[2]), String(crop[2]), "--cropOffset", String(crop[0]), String(crop[1]), source, "--out", cropped], { stdio: "ignore" });
    source = cropped;
  }
  // -Z upscales a smaller image, which only wastes bytes: never exceed the source
  const sourceEdge = Math.max(...execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", source]).toString().match(/\d+/g).slice(-2).map(Number));
  execFileSync("sips", ["-Z", String(Math.min(MAX_EDGE, sourceEdge)), "-s", "format", "jpeg", "-s", "formatOptions", "80", source, "--out", resized], { stdio: "ignore" });
  item.resized = resized;
  item.resizedSize = (await stat(resized)).size;
  if (!crop && item.resizedSize >= item.size) { item.resized = item.source; item.resizedSize = item.size; }
  item.filename = `${basename(item.image.source)}`;
  const dims = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", item.resized]).toString().match(/\d+/g)?.slice(-2).join("x");
  console.log(`  ${crop ? "cropped+resized" : "resized"} ${item.filename}: ${Math.round(item.size / 1024)} KB -> ${Math.round(item.resizedSize / 1024)} KB (${dims})`);
  if (process.env.PREVIEW_DIR) execFileSync("cp", [item.resized, join(process.env.PREVIEW_DIR, `${item.person.displayName.replace(/\s+/g, "-")}.jpg`)]);
  statements.push(`INSERT INTO attachments (id, object_key, filename, content_type, size, created_by, created_at) VALUES (${q(item.attachmentId)}, ${q(`evidence/${item.attachmentId}`)}, ${q(item.filename)}, 'image/jpeg', ${item.resizedSize}, ${q(ACTOR)}, ${q(now)});`);
  statements.push(`UPDATE people SET photo_attachment_id = ${q(item.attachmentId)}, updated_at = ${q(now)} WHERE id = ${q(item.person.id)}${item.person.photoAttachmentId ? "" : " AND photo_attachment_id IS NULL"};`);
  if (item.person.photoAttachmentId) statements.push(`DELETE FROM attachments WHERE id = ${q(item.person.photoAttachmentId)};`);
}
const summary = `Attached ${work.length} photographs from the legacy archive to the people it names.`;
statements.push(`INSERT INTO change_log (id, actor_email, kind, summary, payload_json, created_at) VALUES (${q(randomUUID())}, ${q(ACTOR)}, 'import_legacy_photos', ${q(summary)}, ${q(JSON.stringify({ entries: work.map((item) => ({ person: item.person.displayName, personId: item.person.id, image: item.image.title, source: item.image.source, attachmentId: item.attachmentId })) }))}, ${q(now)});`);
await writeFile(OUT_SQL, statements.join("\n") + "\n");
console.log(`\n${summary}\nSQL written to ${OUT_SQL}`);

if (!process.argv.includes("--execute")) { console.log("Dry run - pass --execute to upload and apply."); process.exit(0); }
for (const item of work) {
  execFileSync("npx", ["wrangler", "r2", "object", "put", `${BUCKET}/evidence/${item.attachmentId}`, "--file", item.resized, "--content-type", "image/jpeg", "--remote"], { stdio: "inherit" });
}
execFileSync("npx", ["wrangler", "d1", "execute", "darabiha-family", "--remote", "--yes", `--file=${OUT_SQL}`], { stdio: "inherit" });
for (const item of work) {
  // the replaced object is unreferenced now; portraits are served immutable, so
  // a new id (not new bytes under the old key) is what makes the swap visible
  if (item.person.photoAttachmentId) execFileSync("npx", ["wrangler", "r2", "object", "delete", `${BUCKET}/evidence/${item.person.photoAttachmentId}`, "--remote"], { stdio: "inherit" });
}
