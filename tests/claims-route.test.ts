import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ listEvidenceClaims: vi.fn() }));
const authz = vi.hoisted(() => ({ requireEditor: vi.fn() }));
vi.mock("../db/store", () => store);
vi.mock("../app/authz", () => authz);

import { GET } from "../app/api/claims/route";

beforeEach(() => {
  vi.clearAllMocks();
  authz.requireEditor.mockResolvedValue({ ok: true, user: { email: "editor@example.com" } });
  store.listEvidenceClaims.mockResolvedValue([{ id: "claim-1" }]);
});

describe("evidence claims route", () => {
  it("returns a private, uncached subject claim list", async () => {
    const response = await GET(new Request("https://darabiha.com/api/claims?subjectType=person&subjectId=person-1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(store.listEvidenceClaims).toHaveBeenCalledWith("person", "person-1");
    await expect(response.json()).resolves.toEqual({ claims: [{ id: "claim-1" }] });
  });

  it("rejects invalid subjects without querying storage", async () => {
    const response = await GET(new Request("https://darabiha.com/api/claims?subjectType=story&subjectId=story-1"));
    expect(response.status).toBe(400);
    expect(store.listEvidenceClaims).not.toHaveBeenCalled();
  });
});
