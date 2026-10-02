import { describe, expect, it } from "vitest";
import {
  karachiDateInputValue,
  karachiYearMonth,
} from "../shared/date";

describe("Karachi calendar values", () => {
  it("uses the next Karachi day while UTC is still on the previous date", () => {
    const date = new Date("2026-09-29T20:00:00.000Z");

    expect(karachiDateInputValue(date)).toBe("2026-09-30");
    expect(karachiYearMonth(date)).toEqual({ year: 2026, month: 9 });
  });
});
