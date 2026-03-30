import type { QuadrantKey, QuadrantLabels } from './types';

export const QUADRANT_ORDER: QuadrantKey[] = ['do', 'schedule', 'delegate', 'delete'];

export const DEFAULT_QUADRANT_LABELS: QuadrantLabels = {
  do: 'Do',
  schedule: 'Schedule',
  delegate: 'Delegate',
  delete: 'Delete'
};

export function quadrantToPriority(quadrant: QuadrantKey): {
  urgent: boolean;
  important: boolean;
} {
  switch (quadrant) {
    case 'do':
      return { urgent: true, important: true };
    case 'schedule':
      return { urgent: false, important: true };
    case 'delegate':
      return { urgent: true, important: false };
    case 'delete':
      return { urgent: false, important: false };
    default:
      return assertNever(quadrant);
  }
}

export function priorityToQuadrant(urgent: boolean, important: boolean): QuadrantKey {
  if (urgent && important) {
    return 'do';
  }

  if (!urgent && important) {
    return 'schedule';
  }

  if (urgent && !important) {
    return 'delegate';
  }

  return 'delete';
}

function assertNever(value: never): never {
  throw new Error(`Unsupported quadrant: ${String(value)}`);
}
