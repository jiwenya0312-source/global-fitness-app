import type { BodyRecord, Measurements } from './body-measurements';

export type CloudBodyRecord = Measurements & {
  day: string;
  deleted: boolean;
  version: number;
  updatedAt: string;
};

export type AccountBodyRecord = BodyRecord & {
  deleted: boolean;
  dirty: boolean;
  cloudVersion: number | null;
  conflict: CloudBodyRecord | null;
};

export type BodyWorkspace = { nextId: number; rows: AccountBodyRecord[] };

export function emptyBodyWorkspace(): BodyWorkspace {
  return { nextId: 1, rows: [] };
}

export function visibleBodyRecords(workspace: BodyWorkspace): BodyRecord[] {
  return workspace.rows.filter((row) => !row.deleted).sort((a, b) => b.day.localeCompare(a.day));
}

function assign(workspace: BodyWorkspace, row: AccountBodyRecord): BodyWorkspace {
  const index = workspace.rows.findIndex((item) => item.day === row.day);
  if (index === -1) return { nextId: workspace.nextId + 1, rows: [...workspace.rows, row] };
  const rows = [...workspace.rows];
  rows[index] = row;
  return { ...workspace, rows };
}

function localEdit(workspace: BodyWorkspace, day: string, values: Measurements, deleted: boolean,
  updatedAt: string) {
  const current = workspace.rows.find((row) => row.day === day);
  return assign(workspace, {
    ...values, day, deleted, updatedAt, dirty: true, id: current?.id ?? workspace.nextId,
    version: (current?.version ?? -1) + 1, cloudVersion: current?.cloudVersion ?? null,
    conflict: current?.conflict ?? null,
  });
}

const removed = { weightKg: null, waistCm: null };

export function saveWorkspaceRecord(workspace: BodyWorkspace, day: string, values: Measurements,
  updatedAt: string, previous?: BodyRecord) {
  const sameDay = workspace.rows.find((row) => row.day === day && !row.deleted);
  if (sameDay && (!previous || previous.id !== sameDay.id)) return null;
  if (previous) {
    const existing = workspace.rows.find((row) => row.id === previous.id);
    if (existing?.version !== previous.version || existing.deleted) return null;
    if (existing.day !== day) workspace = localEdit(workspace, existing.day, removed, true, updatedAt);
  }
  return localEdit(workspace, day, values, false, updatedAt);
}

export function deleteWorkspaceRecord(workspace: BodyWorkspace, record: BodyRecord, updatedAt: string) {
  const current = workspace.rows.find((row) => row.id === record.id);
  if (current?.version !== record.version || current.deleted) return null;
  return localEdit(workspace, current.day, removed, true, updatedAt);
}

export function copyDeviceRecords(workspace: BodyWorkspace, records: BodyRecord[]) {
  const days = new Set(workspace.rows.map((row) => row.day));
  let copied = 0;
  for (const { day, weightKg, waistCm, updatedAt } of records) {
    if (days.has(day)) continue;
    workspace = localEdit(workspace, day, { weightKg, waistCm }, false, updatedAt);
    days.add(day);
    copied += 1;
  }
  return { workspace, copied };
}

function sameValue(a: Measurements & { deleted: boolean }, b: Measurements & { deleted: boolean }) {
  return a.deleted === b.deleted && a.weightKg === b.weightKg && a.waistCm === b.waistCm;
}

function adoptCloud(workspace: BodyWorkspace, data: CloudBodyRecord, current?: AccountBodyRecord) {
  return assign(workspace, {
    ...data, id: current?.id ?? workspace.nextId,
    version: (current?.version ?? -1) + 1, cloudVersion: data.version, dirty: false, conflict: null,
  });
}

export function mergeCloudRecords(workspace: BodyWorkspace, incoming: CloudBodyRecord[]) {
  for (const data of incoming) {
    const current = workspace.rows.find((row) => row.day === data.day);
    if (!current) {
      workspace = adoptCloud(workspace, data);
    } else if (data.version > (current.cloudVersion ?? 0) &&
        data.version >= (current.conflict?.version ?? 0)) {
      if (!current.dirty || sameValue(current, data)) {
        workspace = adoptCloud(workspace, data, current);
      } else if (data.version !== current.conflict?.version) {
        workspace = assign(workspace, {
          ...current, version: current.version + 1, conflict: data,
        });
      }
    }
  }
  return workspace;
}

export function acknowledgeCloudWrite(workspace: BodyWorkspace, sent: AccountBodyRecord, written: CloudBodyRecord) {
  const current = workspace.rows.find((row) => row.day === written.day);
  if (!current || !current.dirty || written.version < (current.conflict?.version ?? 0) ||
      written.version < (current.cloudVersion ?? 0)) return workspace;

  if (sameValue(current, written)) return adoptCloud(workspace, written, current);
  if (written.version === current.cloudVersion || current.cloudVersion !== sent.cloudVersion ||
      current.id !== sent.id) return workspace;

  // An edit made during this upload stays queued against the newly acknowledged version.
  return assign(workspace, {
    ...current, version: current.version + 1, cloudVersion: written.version, conflict: null,
  });
}

export function resolveBodyConflict(workspace: BodyWorkspace, record: AccountBodyRecord, choice: 'device' | 'cloud') {
  const current = workspace.rows.find((row) => row.id === record.id);
  if (current?.version !== record.version || !current.conflict) return null;
  if (choice === 'cloud') return adoptCloud(workspace, current.conflict, current);
  return assign(workspace, {
    ...current, version: current.version + 1, cloudVersion: current.conflict.version, conflict: null, dirty: true,
  });
}
