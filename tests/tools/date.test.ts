import { describe, it, expect } from "vitest";
import { getCurrentDateHandler } from "../../src/tools/date";

describe("getCurrentDateHandler", () => {
  it("returns a valid ISO 8601 date string", () => {
    const result = getCurrentDateHandler({});
    const parsed = new Date(result);
    expect(parsed.toString()).not.toBe("Invalid Date");
  });

  it("returns a date close to now", () => {
    const before = Date.now();
    const result = getCurrentDateHandler({});
    const after = Date.now();
    const parsed = new Date(result).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(after + 1000);
  });
});
