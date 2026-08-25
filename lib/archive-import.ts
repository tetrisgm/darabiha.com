import { unzipSync } from "fflate";

export type ArchiveEntry = { path: string; bytes: Uint8Array; kind: "text" | "image" };

export function extractArchiveEntries(data: Uint8Array, limits = { entryBytes: 4 * 1024 * 1024, totalBytes: 30 * 1024 * 1024, entries: 500 }): ArchiveEntry[] {
  let selectedBytes = 0;
  let selectedEntries = 0;
  const files = unzipSync(data, { filter: (entry) => {
    const supported = /\.(html?|css|js(on)?|txt|md|csv|xml|ged|jpe?g|png|webp|gif)$/i.test(entry.name);
    if (!supported || entry.originalSize > limits.entryBytes || selectedBytes + entry.originalSize > limits.totalBytes || selectedEntries >= limits.entries) return false;
    selectedBytes += entry.originalSize;
    selectedEntries += 1;
    return true;
  } });
  return Object.entries(files).map(([path, bytes]) => ({ path, bytes, kind: /\.(jpe?g|png|webp|gif)$/i.test(path) ? "image" : "text" }));
}
