import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '../main/ipc';
import type {
  CreateTaskInput,
  EisenhoverApi,
  MoveTaskInput,
  QuadrantLabels,
  Task,
  TaskQuery,
  UpdateTaskInput
} from '../../src/shared/types';

const api: EisenhoverApi = {
  listTasks: (query?: TaskQuery) => ipcRenderer.invoke(IPC_CHANNELS.listTasks, query) as Promise<Task[]>,
  createTask: (input: CreateTaskInput) => ipcRenderer.invoke(IPC_CHANNELS.createTask, input) as Promise<Task>,
  updateTask: (id: string, input: UpdateTaskInput) => ipcRenderer.invoke(IPC_CHANNELS.updateTask, id, input) as Promise<Task>,
  moveTask: (input: MoveTaskInput) => ipcRenderer.invoke(IPC_CHANNELS.moveTask, input) as Promise<void>,
  completeTask: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.completeTask, id) as Promise<void>,
  deleteTask: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.deleteTask, id) as Promise<void>,
  restoreTask: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.restoreTask, id) as Promise<void>,
  getQuadrantLabels: () => ipcRenderer.invoke(IPC_CHANNELS.getQuadrantLabels) as Promise<QuadrantLabels>,
  updateQuadrantLabels: (labels: QuadrantLabels) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateQuadrantLabels, labels) as Promise<QuadrantLabels>
};

contextBridge.exposeInMainWorld('eisenhover', api);
