import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

import { IPC_CHANNELS } from './ipc';
import { TaskRepository } from './taskRepository';
import type {
  CreateTaskInput,
  MoveTaskInput,
  QuadrantLabels,
  TaskQuery,
  UpdateTaskInput
} from '../../src/shared/types';

let repository: TaskRepository | null = null;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1200,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  repository = new TaskRepository(app.getPath('userData'));

  ipcMain.handle(IPC_CHANNELS.listTasks, (_, query?: TaskQuery) => repository?.listTasks(query ?? {}));
  ipcMain.handle(IPC_CHANNELS.createTask, (_, input: CreateTaskInput) => repository?.createTask(input));
  ipcMain.handle(IPC_CHANNELS.updateTask, (_, id: string, input: UpdateTaskInput) => repository?.updateTask(id, input));
  ipcMain.handle(IPC_CHANNELS.moveTask, (_, input: MoveTaskInput) => repository?.moveTask(input));
  ipcMain.handle(IPC_CHANNELS.completeTask, (_, id: string) => repository?.completeTask(id));
  ipcMain.handle(IPC_CHANNELS.deleteTask, (_, id: string) => repository?.deleteTask(id));
  ipcMain.handle(IPC_CHANNELS.restoreTask, (_, id: string) => repository?.restoreTask(id));
  ipcMain.handle(IPC_CHANNELS.getQuadrantLabels, () => repository?.getQuadrantLabels());
  ipcMain.handle(IPC_CHANNELS.updateQuadrantLabels, (_, labels: QuadrantLabels) => repository?.updateQuadrantLabels(labels));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  repository?.close();
  repository = null;
});
