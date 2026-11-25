import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import { openDatabaseAsync } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import type { RoutePoint } from './run-route';
import { readRunningData } from './running';

const task = 'fitness-active-run-location';
let opening: ReturnType<typeof openRouteDatabase> | undefined;

async function openRouteDatabase() {
  const db = await openDatabaseAsync('fitness-run-route.db');
  try {
    await db.execAsync(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS route_points (
        run_id INTEGER NOT NULL,
        time INTEGER NOT NULL,
        segment INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        PRIMARY KEY (run_id, time)
      );
      CREATE TABLE IF NOT EXISTS removed_routes (run_id INTEGER PRIMARY KEY);
    `);
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}

function routeDatabase() {
  opening ??= openRouteDatabase().catch((error: unknown) => {
    opening = undefined;
    throw error;
  });
  return opening;
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(task, async ({ data, error }) => {
  if (error || !data?.locations.length) return;
  const { active } = await readRunningData();
  if (!active?.gps || active.resumedAt === null) return;
  const segment = active.resumedAt;
  const points = data.locations.filter(({ coords, timestamp }) => timestamp >= segment
    && coords.accuracy !== null && coords.accuracy <= 25
    && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude));
  if (!points.length) return;
  const db = await routeDatabase();
  for (const { coords, timestamp } of points) {
    await db.runAsync(`
      INSERT OR IGNORE INTO route_points (run_id,time,segment,lat,lon)
      SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM removed_routes WHERE run_id = ?)
    `, active.startedAt, timestamp, segment, coords.latitude, coords.longitude, active.startedAt);
  }
});

export function supportsRunGps() {
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

export async function startRunGps(title: string, message: string) {
  if (!supportsRunGps() || !await TaskManager.isAvailableAsync()) return false;
  if (!(await Location.requestForegroundPermissionsAsync()).granted || !await Location.hasServicesEnabledAsync()) return false;
  await Location.startLocationUpdatesAsync(task, {
    accuracy: Location.Accuracy.High,
    timeInterval: 2000,
    distanceInterval: 5,
    foregroundService: { notificationTitle: title, notificationBody: message, notificationColor: '#C8F46A', killServiceOnDestroy: true },
  });
  return true;
}

export async function stopRunGps() {
  if (supportsRunGps() && await Location.hasStartedLocationUpdatesAsync(task)) {
    await Location.stopLocationUpdatesAsync(task);
  }
}

export async function readRunRoute(id: number): Promise<RoutePoint[]> {
  return (await routeDatabase()).getAllAsync<RoutePoint>(
    'SELECT time,segment,lat,lon FROM route_points WHERE run_id = ? ORDER BY time', id);
}

export async function removeRunRoute(id: number) {
  const db = await routeDatabase();
  await db.runAsync('INSERT OR IGNORE INTO removed_routes (run_id) VALUES (?)', id);
  await db.runAsync('DELETE FROM route_points WHERE run_id = ?', id);
}
