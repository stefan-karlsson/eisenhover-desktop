export type QuadrantKey = 'do' | 'schedule' | 'delegate' | 'delete';

export type TaskStatus = 'active' | 'completed' | 'deleted';

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  urgent: boolean;
  important: boolean;
  quadrant: QuadrantKey;
  dueAt: string | null;
  delegateTo: string | null;
  status: TaskStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
}

export interface QuadrantLabels {
  do: string;
  schedule: string;
  delegate: string;
  delete: string;
}

export interface CreateTaskInput {
  title: string;
  notes?: string | null;
  quadrant: QuadrantKey;
  dueAt?: string | null;
  delegateTo?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string | null;
  dueAt?: string | null;
  delegateTo?: string | null;
}

export interface MoveTaskInput {
  id: string;
  targetQuadrant: QuadrantKey;
  targetIndex: number;
}

export interface TaskQuery {
  status?: TaskStatus | 'all';
  query?: string;
}

export interface EisenhoverApi {
  listTasks(query?: TaskQuery): Promise<Task[]>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, input: UpdateTaskInput): Promise<Task>;
  moveTask(input: MoveTaskInput): Promise<void>;
  completeTask(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  restoreTask(id: string): Promise<void>;
  getQuadrantLabels(): Promise<QuadrantLabels>;
  updateQuadrantLabels(labels: QuadrantLabels): Promise<QuadrantLabels>;
}
