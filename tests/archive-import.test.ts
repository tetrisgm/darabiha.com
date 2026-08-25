import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractArchiveEntries } from "../lib/archive-import";

describe("recursive archive import", () => {
  it("keeps nested family data and images while ignoring unrelated binaries", () => {
    const archive = zipSync({
      "tree/index.html": strToU8("<h1>Nasser Darabiha</h1>"),
      "tree/branches/children.json": strToU8('{"children":["Ramine","Parissima"]}'),
      "tree/photos/nasser.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      "tree/program.exe": new Uint8Array([1, 2, 3]),
    });
    const entries = extractArchiveEntries(archive);
    expect(entries.map((entry) => entry.path)).toEqual(["tree/index.html", "tree/branches/children.json", "tree/photos/nasser.jpg"]);
    expect(entries.map((entry) => entry.kind)).toEqual(["text", "text", "image"]);
  });

  it("rejects entries that exceed the expansion budget before inflating them", () => {
    const archive = zipSync({ "large.txt": strToU8("family".repeat(100)) });
    expect(extractArchiveEntries(archive, { entryBytes: 10, totalBytes: 20, entries: 5 })).toEqual([]);
  });
});
