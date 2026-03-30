import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';

import type { Task } from '../shared/types';
import { formatDateTime, isOverdue } from '../shared/date';

interface TaskCardProps {
  task: Task;
  dragDisabled?: boolean;
  onEdit: (task: Task) => void;
  onComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

export function TaskCard({ task, dragDisabled = false, onEdit, onComplete, onDelete }: TaskCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled
  });
  const adjustedTransform =
    transform && isDragging
      ? {
          ...transform,
          scaleX: 1.03,
          scaleY: 1.03
        }
      : transform;

  const dueLabel = task.dueAt ? formatDateTime(task.dueAt) : '';
  const overdue = isOverdue(task.dueAt);
  const delegateLabel = task.quadrant === 'delegate' && task.delegateTo ? task.delegateTo : '';
  const hasMeta = dueLabel.length > 0 || delegateLabel.length > 0;

  return (
    <article
      className={clsx(
        'task-card',
        !dragDisabled && 'task-card--draggable',
        isDragging && 'task-card--dragging'
      )}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(adjustedTransform),
        transition
      }}
      {...attributes}
      {...listeners}
    >
      <header className="task-card__header">
        <h4>{task.title}</h4>
      </header>

      {task.notes ? (
        <p className="task-card__notes" title={task.notes}>
          {task.notes}
        </p>
      ) : null}

      {hasMeta ? (
        <div className="task-card__meta">
          {dueLabel ? (
            <span className={clsx('task-card__chip', overdue && 'task-card__chip--overdue')} title={dueLabel}>
              <ClockIcon />
              <span>{dueLabel}</span>
            </span>
          ) : null}

          {delegateLabel ? (
            <span className="task-card__chip" title={delegateLabel}>
              <UserIcon />
              <span>{delegateLabel}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="task-card__actions">
        <button
          aria-label="Edit task"
          className="icon-button"
          onClick={() => onEdit(task)}
          onPointerDown={(event) => event.stopPropagation()}
          title="Edit"
          type="button"
        >
          <EditIcon />
        </button>
        <button
          aria-label="Complete task"
          className="icon-button icon-button--ok"
          onClick={() => onComplete(task.id)}
          onPointerDown={(event) => event.stopPropagation()}
          title="Complete"
          type="button"
        >
          <CheckIcon />
        </button>
        <button
          aria-label="Delete task"
          className="icon-button icon-button--danger"
          onClick={() => onDelete(task.id)}
          onPointerDown={(event) => event.stopPropagation()}
          title="Delete"
          type="button"
        >
          <TrashIcon />
        </button>
      </div>
    </article>
  );
}

interface TaskCardPreviewProps {
  task: Task;
}

export function TaskCardPreview({ task }: TaskCardPreviewProps): JSX.Element {
  const dueLabel = task.dueAt ? formatDateTime(task.dueAt) : '';
  const overdue = isOverdue(task.dueAt);
  const delegateLabel = task.quadrant === 'delegate' && task.delegateTo ? task.delegateTo : '';
  const hasMeta = dueLabel.length > 0 || delegateLabel.length > 0;

  return (
    <article className="task-card task-card--drag-overlay">
      <header className="task-card__header">
        <h4>{task.title}</h4>
      </header>

      {task.notes ? (
        <p className="task-card__notes" title={task.notes}>
          {task.notes}
        </p>
      ) : null}

      {hasMeta ? (
        <div className="task-card__meta">
          {dueLabel ? (
            <span className={clsx('task-card__chip', overdue && 'task-card__chip--overdue')} title={dueLabel}>
              <ClockIcon />
              <span>{dueLabel}</span>
            </span>
          ) : null}

          {delegateLabel ? (
            <span className="task-card__chip" title={delegateLabel}>
              <UserIcon />
              <span>{delegateLabel}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="task-card__actions" aria-hidden="true">
        <button aria-label="Edit task" className="icon-button" tabIndex={-1} type="button">
          <EditIcon />
        </button>
        <button aria-label="Complete task" className="icon-button icon-button--ok" tabIndex={-1} type="button">
          <CheckIcon />
        </button>
        <button aria-label="Delete task" className="icon-button icon-button--danger" tabIndex={-1} type="button">
          <TrashIcon />
        </button>
      </div>
    </article>
  );
}

function ClockIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0a9 9 0 0 1 18 0Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function UserIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8Zm7 8a7 7 0 1 0-14 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EditIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="m4 20l4-.8L19 8.2L15.8 5L4.8 16l-.8 4Zm10.5-14.5L17.5 2.5L21 6l-3 3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="m5 13l4 4L19 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function TrashIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M4 7h16m-2 0l-1 13H7L6 7m3 0V4h6v3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
