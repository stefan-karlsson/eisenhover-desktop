import { describe, expect, it } from 'vitest';

import { priorityToQuadrant, quadrantToPriority } from './quadrants';

describe('quadrant conversions', () => {
  it('maps each quadrant to urgent/important flags', () => {
    expect(quadrantToPriority('do')).toEqual({ urgent: true, important: true });
    expect(quadrantToPriority('schedule')).toEqual({ urgent: false, important: true });
    expect(quadrantToPriority('delegate')).toEqual({ urgent: true, important: false });
    expect(quadrantToPriority('delete')).toEqual({ urgent: false, important: false });
  });

  it('maps urgent/important flags to the expected quadrant', () => {
    expect(priorityToQuadrant(true, true)).toBe('do');
    expect(priorityToQuadrant(false, true)).toBe('schedule');
    expect(priorityToQuadrant(true, false)).toBe('delegate');
    expect(priorityToQuadrant(false, false)).toBe('delete');
  });
});
