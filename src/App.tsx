import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors
} from '@dnd-kit/core';

import { MatrixColumn } from './components/MatrixColumn';
import { TaskCardPreview } from './components/TaskCard';
import { TaskModal } from './components/TaskModal';
import { DEFAULT_QUADRANT_LABELS, QUADRANT_ORDER } from './shared/quadrants';
import { formatDateTime } from './shared/date';
import type { EisenhoverApi, QuadrantKey, Task, UpdateTaskInput } from './shared/types';

const QUADRANT_SUBTITLES: Record<QuadrantKey, string> = {
  do: 'Urgent + important',
  schedule: 'Not urgent + important',
  delegate: 'Urgent + less important',
  delete: 'Not urgent + less important'
};

type ViewMode = 'matrix' | 'history';

type HistoryFilter = 'all' | 'completed' | 'deleted';

type HistorySortKey = 'title' | 'quadrant' | 'status' | 'completedAt' | 'deletedAt' | 'updatedAt';

type SortDirection = 'asc' | 'desc';

export function App(): JSX.Element {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const quickAddRefs = useRef<Record<QuadrantKey, HTMLInputElement | null>>({
    do: null,
    schedule: null,
    delegate: null,
    delete: null
  });

  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState(DEFAULT_QUADRANT_LABELS);
  const [view, setView] = useState<ViewMode>('matrix');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null);

  const [historySortKey, setHistorySortKey] = useState<HistorySortKey>('updatedAt');
  const [historySortDirection, setHistorySortDirection] = useState<SortDirection>('desc');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(KeyboardSensor)
  );

  const loadAll = useCallback(async () => {
    const api = getDesktopApi();
    setError(null);
    const [allTasks, nextLabels] = await Promise.all([
      api.listTasks({ status: 'all' }),
      api.getQuadrantLabels()
    ]);

    setTasks(allTasks);
    setLabels(nextLabels);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadAll();
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Unable to load tasks.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadAll]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const insideInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        Boolean(target?.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setView('matrix');
        quickAddRefs.current.do?.focus();
      }

      if (event.key === '/' && !insideInput) {
        event.preventDefault();
        searchRef.current?.focus();
      }

      if (event.key === 'Escape') {
        closeTaskModal();
      }
    };

    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const runMutation = useCallback(
    async (action: () => Promise<void>) => {
      setError(null);
      setIsWorking(true);

      try {
        await action();
        await loadAll();
      } catch (mutationError) {
        const message = mutationError instanceof Error ? mutationError.message : 'Unable to update tasks.';
        setError(message);
      } finally {
        setIsWorking(false);
      }
    },
    [loadAll]
  );

  const activeTasks = useMemo(() => tasks.filter((task) => task.status === 'active'), [tasks]);

  const historyTasks = useMemo(() => tasks.filter((task) => task.status !== 'active'), [tasks]);

  const normalizedSearch = search.trim().toLowerCase();

  const matchesQuery = useCallback(
    (task: Task) => {
      if (normalizedSearch.length === 0) {
        return true;
      }

      const haystack = `${task.title} ${task.notes ?? ''} ${task.delegateTo ?? ''}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    },
    [normalizedSearch]
  );

  const filteredActiveTasks = useMemo(() => activeTasks.filter(matchesQuery), [activeTasks, matchesQuery]);

  const filteredHistoryTasks = useMemo(() => {
    const filtered = historyTasks.filter((task) => {
      if (!matchesQuery(task)) {
        return false;
      }

      if (historyFilter === 'all') {
        return true;
      }

      return task.status === historyFilter;
    });

    return filtered.sort((left, right) => {
      const compare = compareHistoryRows(left, right, historySortKey, labels);
      return historySortDirection === 'asc' ? compare : -compare;
    });
  }, [historyFilter, historySortDirection, historySortKey, historyTasks, labels, matchesQuery]);

  const dragDisabled = normalizedSearch.length > 0 || isWorking;

  const groupedActiveTasks = useMemo(() => groupByQuadrant(filteredActiveTasks), [filteredActiveTasks]);
  const groupedAllActiveTasks = useMemo(() => groupByQuadrant(activeTasks), [activeTasks]);
  const activeDragTask = useMemo(
    () => (activeDragTaskId ? activeTasks.find((task) => task.id === activeDragTaskId) ?? null : null),
    [activeDragTaskId, activeTasks]
  );

  function closeTaskModal(): void {
    setTaskModalOpen(false);
    setEditingTask(null);
  }

  function openEditModal(task: Task): void {
    setEditingTask(task);
    setTaskModalOpen(true);
  }

  async function handleQuickCreate(quadrant: QuadrantKey, title: string): Promise<void> {
    const api = getDesktopApi();
    const trimmed = title.trim();

    if (trimmed.length === 0) {
      return;
    }

    await runMutation(async () => {
      await api.createTask({ title: trimmed, quadrant });
    });
  }

  async function handleRenameQuadrant(quadrant: QuadrantKey, title: string): Promise<void> {
    const api = getDesktopApi();
    const nextLabels = {
      ...labels,
      [quadrant]: title
    };

    await runMutation(async () => {
      await api.updateQuadrantLabels(nextLabels);
    });
  }

  async function handleUpdate(taskId: string, input: UpdateTaskInput): Promise<void> {
    const api = getDesktopApi();
    await api.updateTask(taskId, input);
    await loadAll();
  }

  function handleDragStart(event: DragStartEvent): void {
    if (dragDisabled) {
      return;
    }

    setActiveDragTaskId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    setActiveDragTaskId(null);

    if (dragDisabled || !event.over) {
      return;
    }

    const activeId = String(event.active.id);
    const overId = String(event.over.id);

    const movedTask = activeTasks.find((task) => task.id === activeId);

    if (!movedTask) {
      return;
    }

    const parsedQuadrant = parseColumnId(overId);
    let targetQuadrant: QuadrantKey;
    let targetIndex: number;

    if (parsedQuadrant) {
      targetQuadrant = parsedQuadrant;
      targetIndex = groupedAllActiveTasks[targetQuadrant].length;
    } else {
      const overTask = activeTasks.find((task) => task.id === overId);

      if (!overTask) {
        return;
      }

      targetQuadrant = overTask.quadrant;
      targetIndex = groupedAllActiveTasks[targetQuadrant].findIndex((task) => task.id === overTask.id);

      if (movedTask.quadrant === targetQuadrant) {
        const sourceIndex = groupedAllActiveTasks[targetQuadrant].findIndex((task) => task.id === movedTask.id);

        if (sourceIndex !== -1 && sourceIndex < targetIndex) {
          targetIndex -= 1;
        }
      }
    }

    const api = getDesktopApi();
    await runMutation(() => api.moveTask({ id: movedTask.id, targetQuadrant, targetIndex }));
  }

  function toggleHistorySort(key: HistorySortKey): void {
    if (historySortKey === key) {
      setHistorySortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setHistorySortKey(key);
    setHistorySortDirection(key === 'updatedAt' ? 'desc' : 'asc');
  }

  function sortIndicator(key: HistorySortKey): string {
    if (historySortKey !== key) {
      return '';
    }

    return historySortDirection === 'asc' ? '▲' : '▼';
  }

  const loadingLabel = isLoading ? 'Loading...' : isWorking ? 'Saving...' : null;

  return (
    <main className="app-shell">
      <section className="toolbar">
        <div className="toolbar__tabs">
          <button
            className={`button ${view === 'matrix' ? 'button--active' : 'button--ghost'}`}
            onClick={() => setView('matrix')}
            type="button"
          >
            Matrix
          </button>
          <button
            className={`button ${view === 'history' ? 'button--active' : 'button--ghost'}`}
            onClick={() => setView('history')}
            type="button"
          >
            History
          </button>
        </div>

        <div className="toolbar__search">
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder={view === 'matrix' ? 'Search active tasks' : 'Search historical tasks'}
            ref={searchRef}
            type="search"
            value={search}
          />
          {view === 'history' ? (
            <select onChange={(event) => setHistoryFilter(event.target.value as HistoryFilter)} value={historyFilter}>
              <option value="all">All history</option>
              <option value="completed">Completed</option>
              <option value="deleted">Deleted</option>
            </select>
          ) : null}
        </div>
      </section>

      {loadingLabel ? <p className="status status--muted">{loadingLabel}</p> : null}
      {error ? <p className="status status--error">{error}</p> : null}
      {dragDisabled && view === 'matrix' && normalizedSearch.length > 0 ? (
        <p className="status status--muted">Clear search to drag and reorder tasks.</p>
      ) : null}

      <div className="content-area">
        {view === 'matrix' ? (
          <DndContext
            autoScroll={false}
            collisionDetection={closestCorners}
            onDragCancel={() => setActiveDragTaskId(null)}
            onDragEnd={(event) => void handleDragEnd(event)}
            onDragStart={handleDragStart}
            sensors={sensors}
          >
            <section className="matrix-grid">
              {QUADRANT_ORDER.map((quadrant) => (
                <MatrixColumn
                  key={quadrant}
                  dragDisabled={dragDisabled}
                  isBusy={isWorking}
                  onComplete={(taskId) => {
                    const api = getDesktopApi();
                    return void runMutation(() => api.completeTask(taskId));
                  }}
                  onDelete={(taskId) => {
                    const api = getDesktopApi();
                    return void runMutation(() => api.deleteTask(taskId));
                  }}
                  onEdit={openEditModal}
                  onQuickCreate={(targetQuadrant, title) => handleQuickCreate(targetQuadrant, title)}
                  onRegisterQuickAddRef={(targetQuadrant, element) => {
                    quickAddRefs.current[targetQuadrant] = element;
                  }}
                  onRenameQuadrant={(targetQuadrant, title) => handleRenameQuadrant(targetQuadrant, title)}
                  quadrant={quadrant}
                  subtitle={QUADRANT_SUBTITLES[quadrant]}
                  tasks={groupedActiveTasks[quadrant]}
                  title={labels[quadrant]}
                />
              ))}
            </section>
            <DragOverlay zIndex={2000}>{activeDragTask ? <TaskCardPreview task={activeDragTask} /> : null}</DragOverlay>
          </DndContext>
        ) : (
          <section className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>
                    <button className="history-table__sort" onClick={() => toggleHistorySort('title')} type="button">
                      Title {sortIndicator('title')}
                    </button>
                  </th>
                  <th>
                    <button className="history-table__sort" onClick={() => toggleHistorySort('quadrant')} type="button">
                      Quadrant {sortIndicator('quadrant')}
                    </button>
                  </th>
                  <th>
                    <button className="history-table__sort" onClick={() => toggleHistorySort('status')} type="button">
                      Status {sortIndicator('status')}
                    </button>
                  </th>
                  <th>
                    <button className="history-table__sort" onClick={() => toggleHistorySort('completedAt')} type="button">
                      Completed {sortIndicator('completedAt')}
                    </button>
                  </th>
                  <th>
                    <button className="history-table__sort" onClick={() => toggleHistorySort('deletedAt')} type="button">
                      Deleted {sortIndicator('deletedAt')}
                    </button>
                  </th>
                  <th>
                    <button className="history-table__sort" onClick={() => toggleHistorySort('updatedAt')} type="button">
                      Updated {sortIndicator('updatedAt')}
                    </button>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistoryTasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <strong>{task.title}</strong>
                    </td>
                    <td>{labels[task.quadrant]}</td>
                    <td>
                      <span className={`history-item__pill history-item__pill--${task.status}`}>{task.status}</span>
                    </td>
                    <td>{formatDateTime(task.completedAt)}</td>
                    <td>{formatDateTime(task.deletedAt)}</td>
                    <td>{formatDateTime(task.updatedAt)}</td>
                    <td>
                      <button
                        className="button button--ghost button--compact"
                        onClick={() => {
                          const api = getDesktopApi();
                          return void runMutation(() => api.restoreTask(task.id));
                        }}
                        type="button"
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredHistoryTasks.length === 0 ? (
                  <tr>
                    <td className="history-table__empty" colSpan={7}>
                      No historical tasks found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        )}
      </div>

      <TaskModal
        initialQuadrant={editingTask?.quadrant ?? 'do'}
        initialTask={editingTask}
        labels={labels}
        mode="edit"
        onClose={closeTaskModal}
        onCreate={async () => {}}
        onUpdate={handleUpdate}
        open={taskModalOpen}
      />
    </main>
  );
}

function parseColumnId(value: string): QuadrantKey | null {
  if (!value.startsWith('column-')) {
    return null;
  }

  const maybeQuadrant = value.replace('column-', '');

  if (maybeQuadrant === 'do' || maybeQuadrant === 'schedule' || maybeQuadrant === 'delegate' || maybeQuadrant === 'delete') {
    return maybeQuadrant;
  }

  return null;
}

function groupByQuadrant(tasks: Task[]): Record<QuadrantKey, Task[]> {
  const groups: Record<QuadrantKey, Task[]> = {
    do: [],
    schedule: [],
    delegate: [],
    delete: []
  };

  for (const task of tasks) {
    groups[task.quadrant].push(task);
  }

  for (const quadrant of QUADRANT_ORDER) {
    groups[quadrant].sort((left, right) => left.sortOrder - right.sortOrder);
  }

  return groups;
}

function compareHistoryRows(
  left: Task,
  right: Task,
  sortKey: HistorySortKey,
  labels: Record<QuadrantKey, string>
): number {
  switch (sortKey) {
    case 'title':
      return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
    case 'quadrant':
      return labels[left.quadrant].localeCompare(labels[right.quadrant], undefined, { sensitivity: 'base' });
    case 'status':
      return left.status.localeCompare(right.status, undefined, { sensitivity: 'base' });
    case 'completedAt':
      return compareDate(left.completedAt, right.completedAt);
    case 'deletedAt':
      return compareDate(left.deletedAt, right.deletedAt);
    case 'updatedAt':
      return compareDate(left.updatedAt, right.updatedAt);
    default:
      return 0;
  }
}

function compareDate(left: string | null, right: string | null): number {
  const leftValue = left ? new Date(left).getTime() : Number.NEGATIVE_INFINITY;
  const rightValue = right ? new Date(right).getTime() : Number.NEGATIVE_INFINITY;

  return leftValue - rightValue;
}

function getDesktopApi(): EisenhoverApi {
  const api = window.eisenhover;

  if (!api) {
    throw new Error(
      'Desktop bridge unavailable. Restart the app after rebuilding so the preload script is loaded.'
    );
  }

  return api;
}
