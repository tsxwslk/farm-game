import type { Point } from './content';
import type { FishingSpot } from './scene';

export const RIPPLE_INTERVAL = 90;
export const MAX_CAST_TIME = 20;
export const REEL_TIME = 12;
export const REEL_MISSES = 3;
export const REEL_ZONES = [
  { left: .37, right: .65 },
  { left: .64, right: .91 },
  { left: .12, right: .37 },
] as const;
export const REEL_HITS = REEL_ZONES.length;

export function sameTile(a: Point, b: Point) {
  return a[0] === b[0] && a[1] === b[1];
}

export function rippleSpots(spots: FishingSpot[], rows: number, interval: number, accessible: (spot: FishingSpot) => boolean) {
  const selected: FishingSpot[] = [];
  for (let section = 0; section < 3; section++) {
    let best = 0;
    let chosen: FishingSpot | undefined;
    for (const spot of spots) {
      const [x, y] = spot.tile;
      if (Math.floor(y * 3 / rows) !== section || !accessible(spot)) continue;
      const seed = Math.imul(interval + 1, 0x9e3779b1) ^ Math.imul(x + 1, 0x85ebca6b) ^ Math.imul(y + 1, 0xc2b2ae35);
      const mixed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
      const rank = (mixed ^ (mixed >>> 16)) >>> 0;
      if (!chosen || rank > best) {
        chosen = spot;
        best = rank;
      }
    }
    if (chosen) selected.push(chosen);
  }
  return selected;
}

export function castOutcome(minute: number, ripple: boolean) {
  const bites = Math.random() < (ripple ? .88 : .55);
  const delay = ripple ? 2 + Math.random() * 2 : 4 + Math.random() * 3;
  return { at: minute + delay, bites };
}

export function reelPosition(elapsed: number) {
  const phase = (elapsed % 3) / 3;
  return 1 - Math.abs(phase * 2 - 1);
}
