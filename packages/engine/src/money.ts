/** Round half away from zero to 2 decimal places (bani). */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Ratio rounded to 4 decimal places, e.g. 0.4150 = 41.50%. */
export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function fmt(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(value));
}

export function pct(rate: number): string {
  return `${fmt(rate * 100)}%`;
}

/**
 * Monotonic numeric solve. Expands the upper bound, then bisects.
 * Used so net → gross uses the same forward function as gross → net.
 */
export function binarySearch(target: number, forward: (input: number) => number): number {
  if (target <= 0) return 0;
  let lo = 0;
  let hi = Math.max(target, 1);
  for (let i = 0; i < 48 && forward(hi) < target - 0.005; i++) {
    hi *= 2;
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (forward(mid) < target) lo = mid;
    else hi = mid;
  }
  return round2(hi);
}

export function clamp0(value: number): number {
  return value > 0 ? value : 0;
}

export function addMonths(isoDate: string, months: number): string {
  const [year, month] = isoDate.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function calendarMonth(isoDate: string): number {
  return Number(isoDate.slice(5, 7));
}

export function calendarYear(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}
