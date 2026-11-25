import {
  copyDeviceRecords, deleteWorkspaceRecord, emptyBodyWorkspace, resolveBodyConflict, saveWorkspaceRecord, visibleBodyRecords,
  type AccountBodyRecord, type BodyWorkspace,
} from './account-body';
import { mutateAccountWorkspace } from './account-workspace';
import { readWorkspace } from './account-workspace-storage';
import type { BodyRecord, Measurements } from './body-measurements';

export function mutateWorkspace(userId: string, change: (workspace: BodyWorkspace) => BodyWorkspace | null) {
  return mutateAccountWorkspace('body', userId, emptyBodyWorkspace, change);
}

export async function readAccountMeasurements(userId: string) {
  const { workspace } = await readWorkspace('body', userId, emptyBodyWorkspace);
  return { workspace, records: visibleBodyRecords(workspace) };
}

export async function saveAccountMeasurement(userId: string, day: string, values: Measurements, previous?: BodyRecord) {
  const updatedAt = new Date().toISOString();
  return Boolean(await mutateWorkspace(userId, (workspace) =>
    saveWorkspaceRecord(workspace, day, values, updatedAt, previous)));
}

export async function deleteAccountMeasurement(userId: string, record: BodyRecord) {
  const updatedAt = new Date().toISOString();
  return Boolean(await mutateWorkspace(userId, (workspace) => deleteWorkspaceRecord(workspace, record, updatedAt)));
}

export async function copyAccountMeasurements(userId: string, records: BodyRecord[]) {
  let copied = 0;
  await mutateWorkspace(userId, (workspace) => {
    const result = copyDeviceRecords(workspace, records);
    copied = result.copied;
    return result.workspace;
  });
  return copied;
}

export function chooseAccountMeasurement(userId: string, record: AccountBodyRecord, choice: 'device' | 'cloud') {
  return mutateWorkspace(userId, (workspace) => resolveBodyConflict(workspace, record, choice));
}
