import axios from './axios';

/**
 * 获取所有设备告警（支持搜索与状态筛选）
 * @param {Object} [params] - 查询参数，如 { search: '关键词', status: 'active' }
 * @returns {Promise} 包含设备告警列表的Promise
 */
export const getDeviceAlerts = (params = {}) => {
  return axios.get('/device-alerts/', { params });
};

/**
 * 获取单个设备告警
 * @param {number} id - 设备告警ID
 * @returns {Promise} 包含设备告警详情的Promise
 */
export const getDeviceAlert = (id) => {
  return axios.get(`/device-alerts/${id}/`);
};

/**
 * 创建设备告警
 * @param {Object} alertData - 告警数据
 * @returns {Promise} 创建结果Promise
 */
export const createDeviceAlert = (alertData) => {
  return axios.post('/device-alerts/', alertData);
};

/**
 * 确认告警
 * @param {number} id - 告警ID
 * @returns {Promise} 更新结果Promise
 */
export const acknowledgeAlert = (id) => {
  return axios.patch(`/device-alerts/${id}/`, { status: 'acknowledged' });
};

/**
 * 解决告警
 * @param {number} id - 告警ID
 * @param {Object} resolveData - 解决告警的数据，包含解决方法、值班人员和解决时间
 * @returns {Promise} 更新结果Promise
 */
export const resolveAlert = (id, resolveData) => {
  // 调试日志
  console.log('解决告警原始数据:', resolveData);
  
  // 确保数据类型正确并展开对象属性，而不是嵌套整个对象
  const requestData = {
    status: 'resolved',
    resolution_notes: String(resolveData.resolution_notes || ''), // 确保是字符串
    duty_personnel: resolveData.duty_personnel ? Number(resolveData.duty_personnel) : null, // 确保是数字或null
    resolved_at: resolveData.resolved_at || null // 日期时间字符串
  };
  
  // 如果值班人员ID不是有效的数字，则设置为null
  if (isNaN(requestData.duty_personnel)) {
    requestData.duty_personnel = null;
  }
  
  // 调试日志
  console.log('解决告警请求数据:', requestData);
  
  try {
    return axios.patch(`/device-alerts/${id}/`, requestData);
  } catch (error) {
    console.error('解决告警API错误:', error);
    throw error;
  }
};

/**
 * 关闭告警
 * @param {number} id - 告警ID
 * @returns {Promise} 更新结果Promise
 */
export const closeAlert = (id) => {
  return axios.patch(`/device-alerts/${id}/`, {
    status: 'closed'
  });
};

/**
 * 删除告警
 * @param {number} id - 告警ID
 * @returns {Promise} 删除结果Promise
 */
export const deleteDeviceAlert = (id) => {
  return axios.delete(`/device-alerts/${id}/`);
};

/**
 * 批量导入告警（上传 Excel 文件）
 * @param {File} file - Excel 文件（列：告警标题、告警描述、告警级别、设备SN可选）
 * @returns {Promise} 导入结果 { created, failed, errors }
 */
export const batchImportAlerts = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return axios.post('/device-alerts/batch-import/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * 下载告警批量导入 Excel 模板
 * @returns {Promise} 返回 blob，用于触发浏览器下载
 */
export const downloadAlertImportTemplate = () => {
  return axios.get('/device-alerts/download-import-template/', {
    responseType: 'blob',
  });
};

/**
 * 导出设备告警列表为 Excel（与当前筛选一致）
 * @param {Object} [params] - 与列表一致的筛选 { search, status }
 * @returns {Promise} 返回 blob，用于触发浏览器下载
 */
export const exportDeviceAlerts = (params = {}) => {
  return axios.get('/device-alerts/export/', {
    params,
    responseType: 'blob',
  });
};