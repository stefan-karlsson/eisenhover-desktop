export const IPC_CHANNELS = {
  listTasks: 'tasks:list',
  createTask: 'tasks:create',
  updateTask: 'tasks:update',
  moveTask: 'tasks:move',
  completeTask: 'tasks:complete',
  deleteTask: 'tasks:delete',
  restoreTask: 'tasks:restore',
  getQuadrantLabels: 'quadrants:getLabels',
  updateQuadrantLabels: 'quadrants:updateLabels'
} as const;
