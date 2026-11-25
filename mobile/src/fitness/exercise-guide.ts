import type { Exercise, PlanEquipment } from './workout-plan';

export const exerciseGuides = {
  bodySquat: { equipment: 'bodyweight', cue: 'cueSquat', alternatives: ['gobletSquat', 'legPress', 'supportedSplitSquat'] },
  gobletSquat: { equipment: 'dumbbells', cue: 'cueSquat', alternatives: ['bodySquat', 'legPress', 'supportedSplitSquat'] },
  legPress: { equipment: 'gymMachines', cue: 'cueLegPress', alternatives: ['bodySquat', 'gobletSquat', 'supportedSplitSquat'] },
  supportedSplitSquat: { equipment: 'bodyweight', cue: 'cueSplitSquat', alternatives: ['bodySquat', 'gobletSquat', 'legPress'] },
  gluteBridge: { equipment: 'bodyweight', cue: 'cueBridge', alternatives: ['dumbbellHinge', 'legCurl'] },
  dumbbellHinge: { equipment: 'dumbbells', cue: 'cueHinge', alternatives: ['gluteBridge', 'legCurl'] },
  legCurl: { equipment: 'gymMachines', cue: 'cueLegCurl', alternatives: ['gluteBridge', 'dumbbellHinge'] },
  wallPushup: { equipment: 'bodyweight', cue: 'cueWallPushup', alternatives: ['floorPress', 'chestPress'] },
  floorPress: { equipment: 'dumbbells', cue: 'cueFloorPress', alternatives: ['wallPushup', 'chestPress'] },
  chestPress: { equipment: 'gymMachines', cue: 'cueChestPress', alternatives: ['wallPushup', 'floorPress'] },
  proneW: { equipment: 'bodyweight', cue: 'cueProneW', alternatives: ['dumbbellRow', 'seatedRow'] },
  dumbbellRow: { equipment: 'dumbbells', cue: 'cueRow', alternatives: ['proneW', 'seatedRow'] },
  seatedRow: { equipment: 'gymMachines', cue: 'cueRow', alternatives: ['proneW', 'dumbbellRow'] },
  deadBug: { equipment: 'bodyweight', cue: 'cueDeadBug', alternatives: ['forearmPlank'] },
  forearmPlank: { equipment: 'bodyweight', cue: 'cuePlank', alternatives: ['deadBug'] },
  dumbbellShoulderPress: { equipment: 'dumbbells', cue: 'cueShoulderPress', alternatives: ['proneW', 'machineShoulderPress'] },
  machineShoulderPress: { equipment: 'gymMachines', cue: 'cueShoulderPress', alternatives: ['proneW', 'dumbbellShoulderPress'] },
} as const satisfies Record<Exercise, { equipment: PlanEquipment; cue: string; alternatives: readonly Exercise[] }>;

export function exerciseOptions(name: Exercise, alternative: Exercise | null, selected?: Exercise) {
  return [...new Set([name, ...(alternative ? [alternative] : []), ...exerciseGuides[name].alternatives,
    ...(selected ? [selected] : [])])];
}
