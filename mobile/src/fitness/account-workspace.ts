import { changeWorkspace, readWorkspace, type WorkspaceKind } from './account-workspace-storage';

export async function mutateAccountWorkspace<T>(
  kind: WorkspaceKind, userId: string, empty: () => T, change: (workspace: T) => T | null,
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { revision, workspace } = await readWorkspace(kind, userId, empty);
    const next = change(workspace);
    if (next === null || next === workspace) return next;
    if (await changeWorkspace(kind, userId, revision, next)) return next;
  }
  throw new Error('The account workspace is busy.');
}
