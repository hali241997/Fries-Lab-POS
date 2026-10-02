import { describe, expect, it } from "vitest";
import { elapsedLeaseMs } from "../electron/services/leaseClock";

describe("offline lease clock", () => {
  const anchor = { wallMs: 1_000, performanceMs: 2_000, uptimeMs: 3_000 };

  it("cannot be extended by moving the system clock backwards", () => {
    expect(
      elapsedLeaseMs(anchor, {
        wallMs: 0,
        performanceMs: 12_000,
        uptimeMs: 13_000,
      }),
    ).toBe(10_000);
  });

  it("counts sleep when the OS uptime or wall clock advances", () => {
    expect(
      elapsedLeaseMs(anchor, {
        wallMs: 101_000,
        performanceMs: 2_100,
        uptimeMs: 103_000,
      }),
    ).toBe(100_000);
  });

  it("reaches seven days only at the exact lease boundary", () => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(
      elapsedLeaseMs(anchor, {
        wallMs: anchor.wallMs + sevenDays - 1,
        performanceMs: 2_000,
        uptimeMs: 3_000,
      }),
    ).toBe(sevenDays - 1);
    expect(
      elapsedLeaseMs(anchor, {
        wallMs: anchor.wallMs + sevenDays,
        performanceMs: 2_000,
        uptimeMs: 3_000,
      }),
    ).toBe(sevenDays);
  });
});
