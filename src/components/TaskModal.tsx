import { useEffect, useMemo, useState } from 'react';

import type { CreateTaskInput, QuadrantKey, QuadrantLabels, Task, UpdateTaskInput } from '../shared/types';
import { QUADRANT_ORDER } from '../shared/quadrants';

interface TaskModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  labels: QuadrantLabels;
  initialQuadrant: QuadrantKey;
  initialTask: Task | null;
  onClose: () => void;
  onCreate: (input: CreateTaskInput) => Promise<void>;
  onUpdate: (taskId: string, input: UpdateTaskInput) => Promise<void>;
}

export function TaskModal({
  open,
  mode,
  labels,
  initialQuadrant,
  initialTask,
  onClose,
  onCreate,
  onUpdate
}: TaskModalProps): JSX.Element | null {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [delegateTo, setDelegateTo] = useState('');
  const [quadrant, setQuadrant] = useState<QuadrantKey>(initialQuadrant);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setError(null);

    if (mode === 'edit' && initialTask) {
      setTitle(initialTask.title);
      setNotes(initialTask.notes ?? '');
      setDueAt(toDatetimeLocal(initialTask.dueAt));
      setDelegateTo(initialTask.delegateTo ?? '');
      setQuadrant(initialTask.quadrant);
      return;
    }

    setTitle('');
    setNotes('');
    setDueAt('');
    setDelegateTo('');
    setQuadrant(initialQuadrant);
  }, [initialQuadrant, initialTask, mode, open]);

  const header = useMemo(() => (mode === 'create' ? 'Create Task' : 'Edit Task'), [mode]);
  const allowDelegate = quadrant === 'delegate';

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        aria-modal="true"
        className="modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal__header">
          <h2>{header}</h2>
          <button className="button button--ghost" onClick={onClose} type="button">
            Close
          </button>
        </header>

        <form
          className="modal__form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);

            const trimmedTitle = title.trim();
            if (trimmedTitle.length === 0) {
              setError('Title is required.');
              return;
            }

            setIsSaving(true);

            try {
              if (mode === 'create') {
                await onCreate({
                  title: trimmedTitle,
                  notes,
                  dueAt,
                  delegateTo: allowDelegate ? delegateTo : null,
                  quadrant
                });
              } else if (initialTask) {
                await onUpdate(initialTask.id, {
                  title: trimmedTitle,
                  notes,
                  dueAt,
                  delegateTo: allowDelegate ? delegateTo : null
                });
              }

              onClose();
            } catch (modalError) {
              const message = modalError instanceof Error ? modalError.message : 'Unable to save task.';
              setError(message);
            } finally {
              setIsSaving(false);
            }
          }}
        >
          <label>
            Title
            <input autoFocus onChange={(event) => setTitle(event.target.value)} type="text" value={title} />
          </label>

          {mode === 'create' ? (
            <label>
              Quadrant
              <select onChange={(event) => setQuadrant(event.target.value as QuadrantKey)} value={quadrant}>
                {QUADRANT_ORDER.map((key) => (
                  <option key={key} value={key}>
                    {labels[key]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label>
            Due
            <input onChange={(event) => setDueAt(event.target.value)} type="datetime-local" value={dueAt} />
          </label>

          {allowDelegate ? (
            <label>
              Delegate To
              <input
                onChange={(event) => setDelegateTo(event.target.value)}
                placeholder="Name, role, or team"
                type="text"
                value={delegateTo}
              />
            </label>
          ) : null}

          <label>
            Notes
            <textarea onChange={(event) => setNotes(event.target.value)} rows={4} value={notes} />
          </label>

          {error ? <p className="modal__error">{error}</p> : null}

          <footer className="modal__footer">
            <button className="button button--ghost" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="button button--ok" disabled={isSaving} type="submit">
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function toDatetimeLocal(value: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - offset);
  return local.toISOString().slice(0, 16);
}
