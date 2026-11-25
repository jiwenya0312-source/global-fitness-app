import type { RoutePoint } from './run-route';

export function supportsRunGps() { return false; }
export function startRunGps(_title: string, _message: string) { return Promise.resolve(false); }
export function stopRunGps() { return Promise.resolve(); }
export function readRunRoute(_id: number): Promise<RoutePoint[]> { return Promise.resolve([]); }
export function removeRunRoute(_id: number) { return Promise.resolve(); }
