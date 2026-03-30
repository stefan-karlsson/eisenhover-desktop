import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TaskRepository } from '../../electron/main/taskRepository';

describe('TaskRepository', () => {
  let tempDir = '';
  let repository: TaskRepository;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'eisenhover-test-'));
    repository = new TaskRepository(tempDir);
  });

  afterEach(async () => {
    repository.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('keeps completed and deleted tasks in history', () => {
    const doTask = repository.createTask({ title: 'Critical bug', quadrant: 'do' });
    const deleteTask = repository.createTask({ title: 'Low-value meeting', quadrant: 'delete' });

    repository.completeTask(doTask.id);
    repository.deleteTask(deleteTask.id);

    const active = repository.listTasks({ status: 'active' });
    const completed = repository.listTasks({ status: 'completed' });
    const deleted = repository.listTasks({ status: 'deleted' });

    expect(active).toHaveLength(0);
    expect(completed).toHaveLength(1);
    expect(deleted).toHaveLength(1);
    expect(completed[0].title).toBe('Critical bug');
    expect(deleted[0].title).toBe('Low-value meeting');
  });

  it('persists tasks and labels across repository restart', () => {
    const task = repository.createTask({ title: 'Write roadmap', quadrant: 'schedule' });
    repository.completeTask(task.id);
    repository.updateQuadrantLabels({
      do: 'Act',
      schedule: 'Plan',
      delegate: 'Hand off',
      delete: 'Drop'
    });

    repository.close();
    repository = new TaskRepository(tempDir);

    const completed = repository.listTasks({ status: 'completed' });
    const labels = repository.getQuadrantLabels();

    expect(completed).toHaveLength(1);
    expect(completed[0].title).toBe('Write roadmap');
    expect(labels).toEqual({
      do: 'Act',
      schedule: 'Plan',
      delegate: 'Hand off',
      delete: 'Drop'
    });
  });

  it('reorders and moves active tasks across quadrants', () => {
    const first = repository.createTask({ title: 'A', quadrant: 'do' });
    const second = repository.createTask({ title: 'B', quadrant: 'do' });
    const third = repository.createTask({ title: 'C', quadrant: 'schedule' });

    repository.moveTask({ id: second.id, targetQuadrant: 'do', targetIndex: 0 });
    repository.moveTask({ id: third.id, targetQuadrant: 'do', targetIndex: 1 });

    const active = repository.listTasks({ status: 'active' }).filter((task) => task.quadrant === 'do');

    expect(active.map((task) => task.title)).toEqual(['B', 'C', 'A']);
    expect(active[1].important).toBe(true);
    expect(active[1].urgent).toBe(true);
    expect(first.id).toBeTruthy();
  });
});
