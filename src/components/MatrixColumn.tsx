import { useRef, useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';

import type { QuadrantKey, Task } from '../shared/types';
import { TaskCard } from './TaskCard';

interface MatrixColumnProps {
  quadrant: QuadrantKey;
  title: string;
  subtitle: string;
  tasks: Task[];
  dragDisabled: boolean;
  isBusy: boolean;
  onQuickCreate: (quadrant: QuadrantKey, title: string) => Promise<void>;
  onRenameQuadrant: (quadrant: QuadrantKey, title: string) => Promise<void>;
  onRegisterQuickAddRef: (quadrant: QuadrantKey, element: HTMLInputElement | null) => void;
  onEdit: (task: Task) => void;
  onComplete: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}

export function MatrixColumn({
  quadrant,
  title,
  subtitle,
  tasks,
  dragDisabled,
  isBusy,
  onQuickCreate,
  onRenameQuadrant,
  onRegisterQuickAddRef,
  onEdit,
  onComplete,
  onDelete
}: MatrixColumnProps): JSX.Element {
  const droppableId = `column-${quadrant}`;
  const { setNodeRef } = useDroppable({ id: droppableId });

  const quickInputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurSubmitRef = useRef(false);

  const [quickTitle, setQuickTitle] = useState('');

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(title);
  const [isSavingRename, setIsSavingRename] = useState(false);

  function registerInputRef(element: HTMLInputElement | null): void {
    quickInputRef.current = element;
    onRegisterQuickAddRef(quadrant, element);
  }

  function focusQuickInput(): void {
    quickInputRef.current?.focus();
  }

  async function submitQuickCreate(): Promise<void> {
    const trimmed = quickTitle.trim();

    if (trimmed.length === 0) {
      return;
    }

    try {
      await onQuickCreate(quadrant, trimmed);
      setQuickTitle('');
    } finally {
      focusQuickInput();
    }
  }

  function beginRename(): void {
    setRenameDraft(title);
    setIsRenaming(true);
  }

  function cancelRename(): void {
    setRenameDraft(title);
    setIsRenaming(false);
  }

  async function saveRename(): Promise<void> {
    const trimmed = renameDraft.trim();

    if (trimmed.length === 0 || trimmed === title) {
      cancelRename();
      return;
    }

    setIsSavingRename(true);

    try {
      await onRenameQuadrant(quadrant, trimmed);
      setIsRenaming(false);
    } finally {
      setIsSavingRename(false);
    }
  }

  return (
    <section className="matrix-column" ref={setNodeRef}>
      <header className="matrix-column__header">
        <div className="matrix-column__title-wrap">
          {isRenaming ? (
            <input
              autoFocus
              className="matrix-column__rename-input"
              onBlur={() => {
                if (skipBlurSubmitRef.current) {
                  skipBlurSubmitRef.current = false;
                  return;
                }

                void saveRename();
              }}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void saveRename();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  skipBlurSubmitRef.current = true;
                  cancelRename();
                }
              }}
              value={renameDraft}
            />
          ) : (
            <h3 onDoubleClick={beginRename} title="Double-click to rename">
              {title}
            </h3>
          )}
          <p>{subtitle}</p>
        </div>
      </header>

      <form
        className="matrix-column__quick-add"
        onSubmit={(event) => {
          event.preventDefault();
          void submitQuickCreate();
        }}
      >
        <input
          disabled={isBusy || isSavingRename}
          onChange={(event) => setQuickTitle(event.target.value)}
          placeholder="Add task title and press Enter"
          ref={registerInputRef}
          type="text"
          value={quickTitle}
        />
      </form>

      <div className="matrix-column__body">
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              dragDisabled={dragDisabled}
              task={task}
              onEdit={onEdit}
              onComplete={onComplete}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 ? <p className="matrix-column__empty">No tasks</p> : null}
      </div>
    </section>
  );
}
