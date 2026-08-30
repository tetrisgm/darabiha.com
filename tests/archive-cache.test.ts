import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  cachedTreeJson: vi.fn(),
  getSiteVisibility: vi.fn(),
  readAttachment: vi.fn(),
  readTree: vi.fn(),
}));
const authz = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  requireVisitor: vi.fn(),
}));

vi.mock("../db/store", () => store);
vi.mock("../app/authz", () => authz);

import { GET as getPhoto } from "../app/api/photos/[id]/route";
import { GET as getTree } from "../app/api/tree/route";

type Visibility = "public" | "members" | "password";

beforeEach(() => {
  vi.clearAllMocks();
  authz.requireVisitor.mockResolvedValue({ ok: true });
  authz.requireEditor.mockResolvedValue({ ok: true });
  store.cachedTreeJson.mockReturnValue('{"people":[]}');
  store.readTree.mockResolvedValue({ people: [] });
  store.readAttachment.mockResolvedValue({
    metadata: { contentType: "image/jpeg", filename: "portrait.jpg" },
    object: { body: "portrait" },
  });
});

describe("archive cache policy", () => {
  it("allows shared caching only when the tree is public", async () => {
    store.getSiteVisibility.mockResolvedValue("public" satisfies Visibility);

    const response = await getTree();

    expect(response.headers.get("cache-control")).toBe("public, max-age=30, stale-while-revalidate=120");
    expect(response.headers.has("vary")).toBe(false);
  });

  it.each(["password", "members"] satisfies Visibility[])(
    "prevents shared caching of a %s-gated tree",
    async (visibility) => {
      store.getSiteVisibility.mockResolvedValue(visibility);

      const response = await getTree();

      expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
      expect(response.headers.get("vary")).toBe("Cookie");
    },
  );

  it("allows shared caching only when photographs are public", async () => {
    store.getSiteVisibility.mockResolvedValue("public" satisfies Visibility);

    const response = await getPhoto(new Request("https://darabiha.com/api/photos/photo-1"), {
      params: Promise.resolve({ id: "photo-1" }),
    });

    expect(response.headers.get("cache-control")).toBe("public, max-age=86400, immutable");
    expect(response.headers.has("vary")).toBe(false);
  });

  it.each(["password", "members"] satisfies Visibility[])(
    "prevents shared caching of a %s-gated photograph",
    async (visibility) => {
      store.getSiteVisibility.mockResolvedValue(visibility);

      const response = await getPhoto(new Request("https://darabiha.com/api/photos/photo-1"), {
        params: Promise.resolve({ id: "photo-1" }),
      });

      expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
      expect(response.headers.get("vary")).toBe("Cookie");
    },
  );
});
