export type RoutePoint = { time: number; segment: number; lat: number; lon: number };

const radians = Math.PI / 180;

function distance(a: RoutePoint, b: RoutePoint) {
  const h = Math.sin((b.lat - a.lat) * radians / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((b.lon - a.lon) * radians / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function summarizeRoute(points: RoutePoint[]) {
  const segments: RoutePoint[][] = [];
  let total = 0;
  for (const point of points) {
    let segment = segments.at(-1);
    const previous = segment?.at(-1);
    if (!segment || !previous || previous.segment !== point.segment || point.time - previous.time > 30_000) {
      segment = [point];
      segments.push(segment);
      continue;
    }
    const meters = distance(previous, point);
    const seconds = (point.time - previous.time) / 1000;
    if (seconds <= 0 || meters < 4 || meters / seconds > 10) continue;
    total += meters;
    segment.push(point);
  }
  return { meters: total, segments };
}
