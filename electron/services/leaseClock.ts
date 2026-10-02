export interface LeaseClockReading {
  wallMs: number;
  performanceMs: number;
  uptimeMs: number;
}

export function elapsedLeaseMs(
  anchor: LeaseClockReading,
  current: LeaseClockReading,
): number {
  return Math.max(
    current.performanceMs - anchor.performanceMs,
    current.uptimeMs - anchor.uptimeMs,
    current.wallMs - anchor.wallMs,
    0,
  );
}
