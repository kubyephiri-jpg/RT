import polyline from '@mapbox/polyline';

const ARRIVAL_METERS = 30;
const MAX_OFF_ROUTE_METERS = 250;

const toXY = (lat: number, lng: number, refLat: number) => ({
  x: ((lng * Math.PI) / 180) * Math.cos((refLat * Math.PI) / 180) * 6371000,
  y: ((lat * Math.PI) / 180) * 6371000,
});

/**
 * Trim an encoded polyline from the driver's current position forward.
 * Uses the nearest point on the road SEGMENTS (not just the nearest vertex), so the line is
 * "eaten" smoothly and never jumps back to the start on long straight roads.
 * Returns '' when the driver is at the destination (signal to hide line).
 */
export function trimPolylineFromPosition(
  encodedPolyline: string,
  driverLat: number,
  driverLng: number
): string {
  const coords = polyline.decode(encodedPolyline);
  if (coords.length < 2) return encodedPolyline;

  const p = toXY(driverLat, driverLng, driverLat);
  let bestSeg = 0;
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = toXY(coords[i][0], coords[i][1], driverLat);
    const b = toXY(coords[i + 1][0], coords[i + 1][1], driverLat);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
    if (d < bestDist) { bestDist = d; bestSeg = i; bestT = t; }
  }

  // Far from the route (GPS jump / detour): leave the line as it is.
  if (bestDist > MAX_OFF_ROUTE_METERS) return encodedPolyline;

  const last = coords[coords.length - 1];
  const toEnd = Math.hypot(toXY(last[0], last[1], driverLat).x - p.x, toXY(last[0], last[1], driverLat).y - p.y);
  if (toEnd < ARRIVAL_METERS && bestSeg >= coords.length - 2) return '';

  const a = coords[bestSeg];
  const b = coords[bestSeg + 1];
  const snapped: [number, number] = [a[0] + (b[0] - a[0]) * bestT, a[1] + (b[1] - a[1]) * bestT];
  const trimmed = [snapped, ...coords.slice(bestSeg + 1)] as [number, number][];
  if (trimmed.length < 2) return encodedPolyline;
  return polyline.encode(trimmed);
}
