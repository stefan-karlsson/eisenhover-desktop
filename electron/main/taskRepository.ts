import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

import type {
  CreateTaskInput,
  MoveTaskInput,
  QuadrantKey,
  QuadrantLabels,
  Task,
  TaskQuery,
  TaskStatus,
  UpdateTaskInput
} from '../../src/shared/types';
import { DEFAULT_QUADRANT_LABELS, quadrantToPriority } from '../../src/shared/quadrants';

interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  urgent: number;
  important: number;
  quadrant: QuadrantKey;
  due_at: string | null;
  delegate_to: string | null;
  status: TaskStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  deleted_at: string | null;
}

const QUADRANT_TO_ORDER: Record<QuadrantKey, number> = {
  do: 0,
  schedule: 1,
  delegate: 2,
  delete: 3
};

export class TaskRepository {
  private readonly db: DatabaseSync;

  constructor(baseDir: string) {
    const dbPath = path.join(baseDir, 'eisenhover.db');
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  listTasks(query: TaskQuery = {}): Task[] {
    const clauses: string[] = [];
    const values: (string | number)[] = [];

    if (query.status && query.status !== 'all') {
      clauses.push('status = ?');
      values.push(query.status);
    }

    if (query.query && query.query.trim().length > 0) {
      clauses.push('(LOWER(title) LIKE ? OR LOWER(COALESCE(notes, \"\")) LIKE ? OR LOWER(COALESCE(delegate_to, \"\")) LIKE ?)');
      const wildcard = `%${query.query.trim().toLowerCase()}%`;
      values.push(wildcard, wildcard, wildcard);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const stmt = this.db.prepare(`
      SELECT
        id,
        title,
        notes,
        urgent,
        important,
        quadrant,
        due_at,
        delegate_to,
        status,
        sort_order,
        created_at,
        updated_at,
        completed_at,
        deleted_at
      FROM tasks
      ${where}
      ORDER BY
        CASE quadrant
          WHEN 'do' THEN 0
          WHEN 'schedule' THEN 1
          WHEN 'delegate' THEN 2
          ELSE 3
        END ASC,
        CASE WHEN status = 'active' THEN sort_order ELSE 0 END ASC,
        updated_at DESC
    `);

    const rows = stmt.all(...values) as TaskRow[];
    return rows.map(mapRowToTask);
  }

  createTask(input: CreateTaskInput): Task {
    const now = new Date().toISOString();
    const id = randomUUID();
    const { urgent, important } = quadrantToPriority(input.quadrant);
    const sortOrder = this.nextSortOrder(input.quadrant);

    this.db
      .prepare(
        `
          INSERT INTO tasks (
            id,
            title,
            notes,
            urgent,
            important,
            quadrant,
            due_at,
            delegate_to,
            status,
            sort_order,
            created_at,
            updated_at,
            completed_at,
            deleted_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, NULL)
        `
      )
      .run(
        id,
        input.title.trim(),
        normalizeText(input.notes),
        urgent ? 1 : 0,
        important ? 1 : 0,
        input.quadrant,
        normalizeDate(input.dueAt),
        input.quadrant === 'delegate' ? normalizeText(input.delegateTo) : null,
        sortOrder,
        now,
        now
      );

    return this.getTask(id);
  }

  updateTask(id: string, input: UpdateTaskInput): Task {
    const current = this.getTask(id);
    const nextTitle = input.title === undefined ? current.title : input.title.trim();
    const isDelegateQuadrant = current.quadrant === 'delegate';

    if (nextTitle.length === 0) {
      throw new Error('Task title is required.');
    }

    this.db
      .prepare(
        `
          UPDATE tasks
          SET
            title = ?,
            notes = ?,
            due_at = ?,
            delegate_to = ?,
            updated_at = ?
          WHERE id = ?
        `
      )
      .run(
        nextTitle,
        input.notes === undefined ? current.notes : normalizeText(input.notes),
        input.dueAt === undefined ? current.dueAt : normalizeDate(input.dueAt),
        isDelegateQuadrant
          ? input.delegateTo === undefined
            ? current.delegateTo
            : normalizeText(input.delegateTo)
          : null,
        new Date().toISOString(),
        id
      );

    return this.getTask(id);
  }

  moveTask(input: MoveTaskInput): void {
    const moved = this.getTask(input.id);

    if (moved.status !== 'active') {
      throw new Error('Only active tasks can be moved.');
    }

    this.db.exec('BEGIN');

    try {
      const sourceQuadrant = moved.quadrant;
      const sourceList = this.getActiveTasksInQuadrant(sourceQuadrant).filter((task) => task.id !== moved.id);
      const targetList =
        sourceQuadrant === input.targetQuadrant
          ? sourceList
          : this.getActiveTasksInQuadrant(input.targetQuadrant).filter((task) => task.id !== moved.id);

      const safeIndex = clamp(input.targetIndex, 0, targetList.length);
      targetList.splice(safeIndex, 0, { ...moved, quadrant: input.targetQuadrant });

      if (sourceQuadrant === input.targetQuadrant) {
        this.persistOrderForQuadrant(targetList, input.targetQuadrant);
      } else {
        this.persistOrderForQuadrant(sourceList, sourceQuadrant);
        this.persistOrderForQuadrant(targetList, input.targetQuadrant);
      }

      const priority = quadrantToPriority(input.targetQuadrant);
      this.db
        .prepare(
          'UPDATE tasks SET quadrant = ?, urgent = ?, important = ?, delegate_to = ?, updated_at = ? WHERE id = ?'
        )
        .run(
          input.targetQuadrant,
          priority.urgent ? 1 : 0,
          priority.important ? 1 : 0,
          input.targetQuadrant === 'delegate' ? moved.delegateTo : null,
          new Date().toISOString(),
          moved.id
        );

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  completeTask(id: string): void {
    const task = this.getTask(id);

    if (task.status !== 'active') {
      return;
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `
          UPDATE tasks
          SET status = 'completed', completed_at = ?, deleted_at = NULL, updated_at = ?
          WHERE id = ?
        `
      )
      .run(now, now, id);

    this.resequenceQuadrant(task.quadrant);
  }

  deleteTask(id: string): void {
    const task = this.getTask(id);
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
          UPDATE tasks
          SET status = 'deleted', deleted_at = ?, completed_at = NULL, updated_at = ?
          WHERE id = ?
        `
      )
      .run(now, now, id);

    if (task.status === 'active') {
      this.resequenceQuadrant(task.quadrant);
    }
  }

  restoreTask(id: string): void {
    const task = this.getTask(id);

    if (task.status === 'active') {
      return;
    }

    const sortOrder = this.nextSortOrder(task.quadrant);
    this.db
      .prepare(
        `
          UPDATE tasks
          SET
            status = 'active',
            completed_at = NULL,
            deleted_at = NULL,
            sort_order = ?,
            updated_at = ?
          WHERE id = ?
        `
      )
      .run(sortOrder, new Date().toISOString(), id);
  }

  getQuadrantLabels(): QuadrantLabels {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const labels: QuadrantLabels = { ...DEFAULT_QUADRANT_LABELS };

    for (const row of rows) {
      if (row.key === 'quadrant.do') {
        labels.do = row.value;
      }

      if (row.key === 'quadrant.schedule') {
        labels.schedule = row.value;
      }

      if (row.key === 'quadrant.delegate') {
        labels.delegate = row.value;
      }

      if (row.key === 'quadrant.delete') {
        labels.delete = row.value;
      }
    }

    return labels;
  }

  updateQuadrantLabels(labels: QuadrantLabels): QuadrantLabels {
    const now = new Date().toISOString();
    const sanitized: QuadrantLabels = {
      do: sanitizeLabel(labels.do, DEFAULT_QUADRANT_LABELS.do),
      schedule: sanitizeLabel(labels.schedule, DEFAULT_QUADRANT_LABELS.schedule),
      delegate: sanitizeLabel(labels.delegate, DEFAULT_QUADRANT_LABELS.delegate),
      delete: sanitizeLabel(labels.delete, DEFAULT_QUADRANT_LABELS.delete)
    };

    this.db.exec('BEGIN');

    try {
      this.upsertSetting('quadrant.do', sanitized.do, now);
      this.upsertSetting('quadrant.schedule', sanitized.schedule, now);
      this.upsertSetting('quadrant.delegate', sanitized.delegate, now);
      this.upsertSetting('quadrant.delete', sanitized.delete, now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return this.getQuadrantLabels();
  }

  private migrate(): void {
    const versionRow = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    const version = versionRow.user_version;

    if (version < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          notes TEXT,
          urgent INTEGER NOT NULL,
          important INTEGER NOT NULL,
          quadrant TEXT NOT NULL CHECK (quadrant IN ('do', 'schedule', 'delegate', 'delete')),
          due_at TEXT,
          delegate_to TEXT,
          status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'deleted')),
          sort_order REAL NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          deleted_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_quadrant_status ON tasks(quadrant, status, sort_order);

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        PRAGMA user_version = 1;
      `);

      const now = new Date().toISOString();
      this.upsertSetting('quadrant.do', DEFAULT_QUADRANT_LABELS.do, now);
      this.upsertSetting('quadrant.schedule', DEFAULT_QUADRANT_LABELS.schedule, now);
      this.upsertSetting('quadrant.delegate', DEFAULT_QUADRANT_LABELS.delegate, now);
      this.upsertSetting('quadrant.delete', DEFAULT_QUADRANT_LABELS.delete, now);
    }
  }

  private upsertSetting(key: string, value: string, updatedAt: string): void {
    this.db
      .prepare(
        `
          INSERT INTO settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `
      )
      .run(key, value, updatedAt);
  }

  private getTask(id: string): Task {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            title,
            notes,
            urgent,
            important,
            quadrant,
            due_at,
            delegate_to,
            status,
            sort_order,
            created_at,
            updated_at,
            completed_at,
            deleted_at
          FROM tasks
          WHERE id = ?
        `
      )
      .get(id) as TaskRow | undefined;

    if (!row) {
      throw new Error('Task not found.');
    }

    return mapRowToTask(row);
  }

  private nextSortOrder(quadrant: QuadrantKey): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM tasks WHERE quadrant = ? AND status = 'active'")
      .get(quadrant) as { max_sort_order: number };

    return row.max_sort_order + 1;
  }

  private getActiveTasksInQuadrant(quadrant: QuadrantKey): Task[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            title,
            notes,
            urgent,
            important,
            quadrant,
            due_at,
            delegate_to,
            status,
            sort_order,
            created_at,
            updated_at,
            completed_at,
            deleted_at
          FROM tasks
          WHERE quadrant = ? AND status = 'active'
          ORDER BY sort_order ASC, created_at ASC
        `
      )
      .all(quadrant) as TaskRow[];

    return rows.map(mapRowToTask);
  }

  private persistOrderForQuadrant(tasks: Task[], quadrant: QuadrantKey): void {
    const sortStmt = this.db.prepare('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?');

    for (let index = 0; index < tasks.length; index += 1) {
      sortStmt.run(index + 1, new Date().toISOString(), tasks[index].id);
    }

    const priority = quadrantToPriority(quadrant);
    const quadrantStmt = this.db.prepare('UPDATE tasks SET quadrant = ?, urgent = ?, important = ? WHERE id = ?');

    for (const task of tasks) {
      quadrantStmt.run(quadrant, priority.urgent ? 1 : 0, priority.important ? 1 : 0, task.id);
    }
  }

  private resequenceQuadrant(quadrant: QuadrantKey): void {
    const rows = this.db
      .prepare("SELECT id FROM tasks WHERE quadrant = ? AND status = 'active' ORDER BY sort_order ASC, created_at ASC")
      .all(quadrant) as Array<{ id: string }>;

    const stmt = this.db.prepare('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?');

    for (let index = 0; index < rows.length; index += 1) {
      stmt.run(index + 1, new Date().toISOString(), rows[index].id);
    }
  }
}

function mapRowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    urgent: row.urgent === 1,
    important: row.important === 1,
    quadrant: row.quadrant,
    dueAt: row.due_at,
    delegateTo: row.delegate_to,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at
  };
}

function sanitizeLabel(label: string, fallback: string): string {
  const trimmed = label.trim();

  if (trimmed.length === 0) {
    return fallback;
  }

  if (trimmed.length > 40) {
    return trimmed.slice(0, 40);
  }

  return trimmed;
}

function normalizeText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function compareTasksForMatrix(left: Task, right: Task): number {
  const quadrantDelta = QUADRANT_TO_ORDER[left.quadrant] - QUADRANT_TO_ORDER[right.quadrant];

  if (quadrantDelta !== 0) {
    return quadrantDelta;
  }

  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.createdAt.localeCompare(right.createdAt);
}
