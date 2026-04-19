/**
 * 报表配置本地存储
 * 使用 localStorage 存储导出配置与定时任务，后续可扩展为后端 API
 */

const STORAGE_KEYS = {
  EXPORT_CONFIGS: 'report_export_configs',
  SCHEDULED_TASKS: 'report_scheduled_tasks',
};

/**
 * 生成唯一 ID
 * @returns {string}
 */
const generateId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

/**
 * 获取导出配置列表
 * @returns {Array<{id: string, name: string, period_type: string, start_date: string, end_date: string, format: string, client_id?: number, cabinet_id?: number, cabinet_ids?: number[], createdAt: string}>}
 */
export const getExportConfigs = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EXPORT_CONFIGS);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

/**
 * 保存导出配置
 * @param {Object} config - 配置对象（可含 id 则更新，否则新增）
 * @param {string} config.name - 配置名称
 * @param {string} config.period_type
 * @param {string} config.start_date
 * @param {string} config.end_date
 * @param {string} config.format
 * @param {number} [config.client_id]
 * @param {number} [config.cabinet_id]
 * @param {number[]} [config.cabinet_ids]
 * @returns {string} 配置 id
 */
export const saveExportConfig = (config) => {
  const list = getExportConfigs();
  const now = new Date().toISOString();
  const payload = {
    id: config.id || generateId(),
    name: config.name || '未命名配置',
    period_type: config.period_type || 'daily',
    start_date: config.start_date,
    end_date: config.end_date,
    format: config.format || 'excel',
    client_id: config.client_id ?? null,
    cabinet_id: config.cabinet_id ?? null,
    cabinet_ids: Array.isArray(config.cabinet_ids) ? config.cabinet_ids : [],
    createdAt: config.createdAt || now,
    updatedAt: now,
  };
  const idx = list.findIndex((c) => c.id === payload.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...payload };
  } else {
    list.push(payload);
  }
  localStorage.setItem(STORAGE_KEYS.EXPORT_CONFIGS, JSON.stringify(list));
  return payload.id;
};

/**
 * 删除导出配置
 * @param {string} id - 配置 id
 */
export const deleteExportConfig = (id) => {
  const list = getExportConfigs().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEYS.EXPORT_CONFIGS, JSON.stringify(list));
};

/**
 * 获取定时任务列表
 * @returns {Array<{id: string, name: string, configId?: string, cronExpression?: string, enabled: boolean, nextRunAt?: string, createdAt: string}>}
 */
export const getScheduledTasks = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SCHEDULED_TASKS);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

/**
 * 保存定时任务（新增或更新）
 * @param {Object} task
 * @param {string} [task.id]
 * @param {string} task.name
 * @param {string} [task.configId]
 * @param {string} [task.cronExpression]
 * @param {boolean} [task.enabled]
 * @returns {string} 任务 id
 */
export const saveScheduledTask = (task) => {
  const list = getScheduledTasks();
  const now = new Date().toISOString();
  const payload = {
    id: task.id || generateId(),
    name: task.name || '未命名任务',
    configId: task.configId ?? null,
    cronExpression: task.cronExpression ?? '',
    enabled: task.enabled !== false,
    nextRunAt: task.nextRunAt ?? null,
    createdAt: task.createdAt || now,
    updatedAt: now,
  };
  const idx = list.findIndex((t) => t.id === payload.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...payload };
  } else {
    list.push(payload);
  }
  localStorage.setItem(STORAGE_KEYS.SCHEDULED_TASKS, JSON.stringify(list));
  return payload.id;
};

/**
 * 更新定时任务部分字段
 * @param {string} id - 任务 id
 * @param {Object} updates - 要更新的字段
 */
export const updateScheduledTask = (id, updates) => {
  const list = getScheduledTasks();
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEYS.SCHEDULED_TASKS, JSON.stringify(list));
};

/**
 * 删除定时任务
 * @param {string} id - 任务 id
 */
export const deleteScheduledTask = (id) => {
  const list = getScheduledTasks().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEYS.SCHEDULED_TASKS, JSON.stringify(list));
};
