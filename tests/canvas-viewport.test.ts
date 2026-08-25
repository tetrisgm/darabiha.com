import { describe, expect, it } from "vitest";
import { clampScale, zoomView } from "../app/components/FamilyTreeCanvas";

describe("family canvas viewport math", () => {
  it("keeps zoom within usable bounds", () => {
    expect(clampScale(0.1)).toBe(0.5);
    expect(clampScale(10)).toBe(3);
  });

  it("keeps the point beneath the cursor fixed while zooming", () => {
    const before = { x: 40, y: -20, scale: 1 };
    const cursor = { x: 120, y: 80 };
    const after = zoomView(before, 2, cursor);
    expect(after.scale).toBe(2);
    expect((cursor.x - after.x) / after.scale).toBe((cursor.x - before.x) / before.scale);
    expect((cursor.y - after.y) / after.scale).toBe((cursor.y - before.y) / before.scale);
  });
});
