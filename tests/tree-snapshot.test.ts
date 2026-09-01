import { describe, expect, it } from "vitest";
import { isD1DailyReadLimitError, parseMemberAccessSnapshot, parseTreeSnapshot } from "../lib/tree-snapshot";

describe("tree snapshot fallback", () => {
  it("recognizes only the Cloudflare daily row-read quota failure", () => {
    expect(isD1DailyReadLimitError(new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit."))).toBe(true);
    expect(isD1DailyReadLimitError(new Error("D1_ERROR: database unavailable"))).toBe(false);
  });

  it("accepts a complete family tree and rejects malformed snapshots", () => {
    const tree = { people: [], relationships: [], stories: [] };
    expect(parseTreeSnapshot(JSON.stringify(tree))).toEqual(tree);
    expect(parseTreeSnapshot("{}")) .toBeNull();
    expect(parseTreeSnapshot("not json")).toBeNull();
  });

  it("validates the private member-access snapshot shape", () => {
    const snapshot = { members: [{ email: "viewer@example.com", role: "canView", personId: null }], links: [] };
    expect(parseMemberAccessSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(parseMemberAccessSnapshot('{"members":[]}')).toBeNull();
  });
});
