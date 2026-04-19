/**
 * 统一API服务文件
 * 整合所有API调用方法，提供完整的后端接口访问
 * 
 * 使用方式：
 * import api from './api';
 * api.getDevices();
 * 
 * 或按需导入：
 * import { deviceAPI } from './api';
 * deviceAPI.getDevices();
 */

import request from './axios';
import { fetchAllPages } from './pagination';
import { pduDeviceAPI, pduPortAPI, pduDataAPI } from './pduAPI';
import { warehouseDeviceAPI } from './warehouseDeviceAPI';
import operationStoryImportAPI from './operationStoryImportAPI';
import reportAPI from './reportAPI';

/**
 * 设备API服务
 * 提供设备相关的API请求方法
 */
const deviceAPI = {
  /**
   * 获取设备列表（支持分页）
   * @param {Object} [params] - 查询参数，如 { page: 1, page_size: 20 }
   * @returns {Promise} 设备列表Promise，返回 { count, results } 分页结构
   */
  getDevices: (params) => {
    return request.get('/devices/', { params: params || {} });
  },

  /**
   * 获取单个设备详情
   * @param {number} id - 设备ID
   * @returns {Promise} 设备详情Promise
   */
  getDevice: (id) => {
    return request.get(`/devices/${id}/`);
  },

  /**
   * 创建新设备
   * @param {Object} deviceData - 设备数据对象
   * @returns {Promise} 创建结果Promise
   */
  createDevice: (deviceData) => {
    return request.post('/devices/', deviceData);
  },

  /**
   * 更新设备信息
   * @param {number} id - 设备ID
   * @param {Object} deviceData - 设备更新数据
   * @returns {Promise} 更新结果Promise
   */
  updateDevice: (id, deviceData) => {
    return request.put(`/devices/${id}/`, deviceData);
  },

  /**
   * 删除设备
   * @param {number} id - 设备ID
   * @returns {Promise} 删除结果Promise
   */
  deleteDevice: (id) => {
    return request.delete(`/devices/${id}/`);
  },

  /**
   * 下架设备
   * @param {number} id - 设备ID
   * @param {Object} data - 下架信息，包含下架原因和状态
   * @returns {Promise} 下架结果Promise
   */
  decommissionDevice: (id, data) => {
    return request.post(`/devices/${id}/decommission/`, data);
  },
  
  /**
   * 批量关联设备与事件
   * @param {Object} data - 关联数据，包含event_id和device_ids数组
   * @returns {Promise} 关联结果Promise
   */
  batchAssociateDevices: (data) => {
    // 确保请求数据格式正确
    const payload = {
      event_id: parseInt(data.event_id, 10),
      device_ids: Array.isArray(data.device_ids) 
        ? data.device_ids.map(id => parseInt(id, 10)) 
        : [parseInt(data.device_ids, 10)]
    };
    return request.post('/event-devices/batch_create/', payload);
  },

  /**
   * 获取设备关联的事件列表
   * @param {number} deviceId - 设备ID
   * @returns {Promise} 关联事件列表Promise
   */
  getDeviceEvents: (deviceId) => {
    return request.get(`/devices/${deviceId}/events/`);
  }
};

/**
 * 机房API服务
 */
const roomAPI = {
  /**
   * 获取所有机房
   * @returns {Promise} 返回机房列表
   */
  getRooms: () => {
    return request.get('/rooms/');
  },

  /**
   * 获取机房使用情况统计（首页用，后端聚合保证统计全量）
   * @returns {Promise<{data: Array<{id, name, cabinetCount, usedCabinetsCount, deviceCount, usageRate}>}>}
   */
  getRoomUsageStats: () => {
    return request.get('/rooms/usage-stats/');
  },

  /**
   * 获取指定机房的机柜列表及每个机柜设备数（供 F1B/F1D 机房页一次拉取，避免分页拉全量设备）
   * @param {number} roomId 机房ID
   * @returns {Promise<{data: Array<{id, name, room, room_name, client_name, device_count}>}>}
   */
  getRoomCabinetsWithStats: (roomId) => {
    return request.get(`/rooms/${roomId}/cabinets-with-stats/`);
  },

  /**
   * 获取单个机房详情
   * @param {number} id 机房ID
   * @returns {Promise} 返回机房详情
   */
  getRoom: (id) => {
    return request.get(`/rooms/${id}/`);
  },
  
  /**
   * 创建机房
   * @param {Object} data 机房数据
   * @returns {Promise} 返回创建结果
   */
  createRoom: (data) => {
    return request.post('/rooms/', data);
  },

  /**
   * 更新机房信息
   * @param {number} id 机房ID
   * @param {Object} data 更新的数据
   * @returns {Promise} 返回更新结果
   */
  updateRoom: (id, data) => {
    return request.put(`/rooms/${id}/`, data);
  },

  /**
   * 删除机房
   * @param {number} id 机房ID
   * @returns {Promise} 返回删除结果
   */
  deleteRoom: (id) => {
    return request.delete(`/rooms/${id}/`);
  }
};

/**
 * 机柜API服务
 */
const cabinetAPI = {
  /**
   * 获取机柜列表（支持可选查询参数，如 client 按客户筛选）
   * @param {Object} [params] - 可选，查询参数，如 { client: 1 }
   * @returns {Promise} 返回机柜列表
   */
  getCabinets: (params) => {
    return request.get('/cabinets/', { params });
  },

  /**
   * 获取单个机柜详情
   * @param {number} id 机柜ID
   * @returns {Promise} 返回机柜详情
   */
  getCabinet: (id) => {
    return request.get(`/cabinets/${id}/`);
  },
  
  /**
   * 创建机柜
   * @param {Object} data 机柜数据
   * @returns {Promise} 返回创建结果
   */
  createCabinet: (data) => {
    return request.post('/cabinets/', data);
  },

  /**
   * 更新机柜信息
   * @param {number} id 机柜ID
   * @param {Object} data 更新的数据
   * @returns {Promise} 返回更新结果
   */
  updateCabinet: (id, data) => {
    return request.put(`/cabinets/${id}/`, data);
  },

  /**
   * 删除机柜
   * @param {number} id 机柜ID
   * @returns {Promise} 返回删除结果
   */
  deleteCabinet: (id) => {
    return request.delete(`/cabinets/${id}/`);
  },

  /**
   * 获取所有机柜数据（处理分页）
   * @returns {Promise} 返回所有机柜列表
   */
  getAllCabinets: async () => {
    return fetchAllPages(request, '/cabinets/');
  },

  /**
   * 根据机房ID获取机柜列表
   * @param {number} roomId - 机房ID
   * @returns {Promise} 机柜列表Promise
   */
  getCabinetsByRoom: async (roomId) => {
    try {
      // 复用 getAllCabinets，确保不受分页限制获取所有机柜
      const response = await cabinetAPI.getAllCabinets();
      const list = response.data || [];
      const roomIdNum = parseInt(roomId, 10);
      const filteredCabinets = list.filter(cabinet => {
        const rid = typeof cabinet.room === 'object' && cabinet.room !== null
          ? (cabinet.room.id ?? cabinet.room)
          : cabinet.room;
        return rid != null && parseInt(rid, 10) === roomIdNum;
      });
      return { data: filteredCabinets };
    } catch (error) {
      throw error;
    }
  }
};

/**
 * 事件API服务
 */
const eventAPI = {
  /**
   * 获取事件列表（支持分页）
   * @param {Object} [params] - 查询参数，如 { page: 1, page_size: 20 }
   * @returns {Promise} 返回事件列表，含 count、results
   */
  getEvents: (params) => {
    return request.get('/events/', { params: params || {} });
  },

  /**
   * 获取所有事件数据（处理分页）
   * @returns {Promise} 返回所有事件列表
   */
  getAllEvents: async () => {
    return fetchAllPages(request, '/events/', { ordering: '-date' });
  },

  /**
   * 获取单个事件详情
   * @param {number} id 事件ID
   * @returns {Promise} 返回事件详情
   */
  getEvent: (id) => {
    return request.get(`/events/${id}/`);
  },

  /**
   * 创建新事件
   * @param {Object} eventData 事件数据
   * @returns {Promise} 返回创建结果
   */
  createEvent: (eventData) => {
    return request.post('/events/', eventData);
  },

  /**
   * 更新事件
   * @param {number} id 事件ID
   * @param {Object} eventData 事件数据
   * @returns {Promise} 返回更新结果
   */
  updateEvent: (id, eventData) => {
    return request.put(`/events/${id}/`, eventData);
  },

  /**
   * 删除事件
   * @param {number} id 事件ID
   * @returns {Promise} 返回删除结果
   */
  deleteEvent: (id) => {
    return request.delete(`/events/${id}/`);
  },

  /**
   * 创建单个进场人员
   * @param {Object} personnelData 进场人员数据 { name, id_card, contact_info }
   * @returns {Promise} 返回创建结果
   */
  createSingleEntryPersonnel: (personnelData) => {
    return request.post('/entry-personnel/', personnelData);
  },

  /**
   * 创建事件与进场人员的关联关系
   * @param {number} eventId 事件ID
   * @param {number} personnelId 进场人员ID
   * @returns {Promise} 返回创建结果
   */
  createEventPersonnelRelation: (eventId, personnelId) => {
    return request.post(`/events/${eventId}/entry-personnel/`, {
      entry_personnel_id: personnelId
    });
  }
};

/**
 * 入场人员API服务
 */
const entryPersonnelAPI = {
  /**
   * 获取入场人员列表（支持分页）
   * @param {Object} [params] - 查询参数，如 { page: 1, page_size: 20 }
   * @returns {Promise} 返回入场人员列表，含 count、results
   */
  getEntryPersonnel: (params) => {
    return request.get('/entry-personnel/', { params: params || {} });
  },

  /**
   * 获取单个入场人员详情
   * @param {number} id 入场人员ID
   * @returns {Promise} 返回入场人员详情
   */
  getEntryPerson: (id) => {
    return request.get(`/entry-personnel/${id}/`);
  },

  /**
   * 创建入场人员
   * @param {Object} data 入场人员数据
   * @returns {Promise} 返回创建结果
   */
  createEntryPerson: (data) => {
    return request.post('/entry-personnel/', data);
  },

  /**
   * 更新入场人员信息
   * @param {number} id 入场人员ID
   * @param {Object} data 更新的数据
   * @returns {Promise} 返回更新结果
   */
  updateEntryPerson: (id, data) => {
    return request.put(`/entry-personnel/${id}/`, data);
  },

  /**
   * 删除入场人员
   * @param {number} id 入场人员ID
   * @returns {Promise} 返回删除结果
   */
  deleteEntryPerson: (id) => {
    return request.delete(`/entry-personnel/${id}/`);
  },

  /**
   * 批量关联入场人员与事件
   * @param {Object} data 关联数据，包含event_id和entry_personnel_ids数组
   * @returns {Promise} 返回关联结果
   */
  batchAssociateEntryPersonnel: (data) => {
    // 确保请求数据格式正确
    const payload = {
      event_id: parseInt(data.event_id, 10),
      entry_personnel_ids: Array.isArray(data.entry_personnel_ids) 
        ? data.entry_personnel_ids.map(id => parseInt(id, 10)) 
        : [parseInt(data.entry_personnel_ids, 10)]
    };
    return request.post('/event-entry-personnel/batch_create/', payload);
  },

  /**
   * 移除入场人员与事件的关联
   * @param {Object} data 关联数据，包含event_id和entry_personnel_id
   * @returns {Promise} 返回移除结果
   */
  removeAssociation: (data) => {
    return request.post('/event-entry-personnel/remove_association/', data);
  },

  /**
   * 获取进场记录列表（每条为「某人在某次事件进场」一条，同一人多次进场会有多条）
   * @param {Object} [params] - 查询参数，如 { page: 1, page_size: 20 }
   * @returns {Promise} 返回 { count, results }，每项含 id、person、event_info
   */
  getEntryRecords: (params) => {
    return request.get('/event-entry-personnel/', { params: params || {} });
  },

  /**
   * 删除一条进场记录（仅删除该次事件与人员的关联，不删除人员本身）
   * @param {number} id - 进场记录 ID（event_entry_personnel 表主键）
   * @returns {Promise}
   */
  deleteEntryRecord: (id) => {
    return request.delete(`/event-entry-personnel/${id}/`);
  }
};

/**
 * 下架设备API服务
 */
const decommissionedDeviceAPI = {
  /**
   * 获取下架设备列表（支持分页）
   * @param {Object} [params] - 查询参数，如 { page: 1, page_size: 20 }
   * @returns {Promise} 返回下架设备列表，含 count、results
   */
  getDecommissionedDevices: (params) => {
    return request.get('/decommissioned-devices/', { params: params || {} });
  },

  /**
   * 获取单个下架设备详情
   * @param {number} id 下架设备ID
   * @returns {Promise} 返回下架设备详情
   */
  getDecommissionedDevice: (id) => {
    return request.get(`/decommissioned-devices/${id}/`);
  },

  /**
   * 创建下架设备记录
   * @param {Object} data 下架设备数据
   * @returns {Promise} 返回创建结果
   */
  createDecommissionedDevice: (data) => {
    return request.post('/decommissioned-devices/', data);
  },

  /**
   * 更新下架设备信息
   * @param {number} id 下架设备ID
   * @param {Object} data 更新的数据
   * @returns {Promise} 返回更新结果
   */
  updateDecommissionedDevice: (id, data) => {
    return request.put(`/decommissioned-devices/${id}/`, data);
  },

  /**
   * 删除下架设备记录
   * @param {number} id 下架设备ID
   * @returns {Promise} 返回删除结果
   */
  deleteDecommissionedDevice: (id) => {
    return request.delete(`/decommissioned-devices/${id}/`);
  },

  /**
   * 批量关联下架设备与事件
   * @param {Object} data 关联数据，包含event_id和decommissioned_device_ids数组
   * @returns {Promise} 返回关联结果
   */
  batchAssociateDecommissionedDevices: (data) => {
    // 确保请求数据格式正确
    const payload = {
      event_id: parseInt(data.event_id, 10),
      decommissioned_device_ids: Array.isArray(data.decommissioned_device_ids) 
        ? data.decommissioned_device_ids.map(id => parseInt(id, 10)) 
        : [parseInt(data.decommissioned_device_ids, 10)]
    };
    return request.post('/event-decommissioned-devices/batch_create/', payload);
  },

  /**
   * 移除下架设备与事件的关联
   * @param {Object} data 关联数据，包含event_id和decommissioned_device_id
   * @returns {Promise} 返回移除结果
   */
  removeAssociation: (data) => {
    return request.post('/event-decommissioned-device/remove_association/', data);
  }
};

/**
 * 设备告警API服务
 */
const deviceAlertAPI = {
  /**
   * 获取所有设备告警
   * @param {Object} params 查询参数，如状态过滤
   * @returns {Promise} 返回设备告警列表
   */
  getDeviceAlerts: (params = {}) => {
    return request.get('/device-alerts/', { params });
  },

  /**
   * 获取单个设备告警详情
   * @param {number} id 设备告警ID
   * @returns {Promise} 返回设备告警详情
   */
  getDeviceAlert: (id) => {
    return request.get(`/device-alerts/${id}/`);
  },

  /**
   * 创建设备告警
   * @param {Object} data 设备告警数据
   * @returns {Promise} 返回创建结果
   */
  createDeviceAlert: (data) => {
    return request.post('/device-alerts/', data);
  },

  /**
   * 更新设备告警信息
   * @param {number} id 设备告警ID
   * @param {Object} data 更新的数据
   * @returns {Promise} 返回更新结果
   */
  updateDeviceAlert: (id, data) => {
    return request.put(`/device-alerts/${id}/`, data);
  },

  /**
   * 删除设备告警
   * @param {number} id 设备告警ID
   * @returns {Promise} 返回删除结果
   */
  deleteDeviceAlert: (id) => {
    return request.delete(`/device-alerts/${id}/`);
  },

  /**
   * 确认设备告警
   * @param {number} id 设备告警ID
   * @returns {Promise} 返回确认结果
   */
  acknowledgeAlert: (id) => {
    return request.put(`/device-alerts/${id}/`, { status: 'acknowledged' });
  },

  /**
   * 解决设备告警
   * @param {number} id 设备告警ID
   * @param {string} notes 解决方案说明
   * @returns {Promise} 返回解决结果
   */
  resolveAlert: (id, notes) => {
    return request.put(`/device-alerts/${id}/`, { 
      status: 'resolved',
      resolution_notes: notes,
      resolved_at: new Date().toISOString()
    });
  },

  /**
   * 批量导入告警（上传 Excel 文件）
   * @param {File} file Excel 文件
   * @returns {Promise} 返回导入结果 { created, failed, errors }
   */
  batchImportAlerts: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request.post('/device-alerts/batch-import/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /**
   * 下载告警批量导入 Excel 模板
   * @returns {Promise} 返回 blob
   */
  downloadAlertImportTemplate: () => {
    return request.get('/device-alerts/download-import-template/', {
      responseType: 'blob',
    });
  },

  /**
   * 导出设备告警列表为 Excel
   * @param {Object} params 与列表一致的筛选 { search, status }
   * @returns {Promise} 返回 blob
   */
  exportDeviceAlerts: (params = {}) => {
    return request.get('/device-alerts/export/', {
      params,
      responseType: 'blob',
    });
  }
};

/**
 * 客户API服务
 */
const clientAPI = {
  /**
   * 获取所有客户
   * @returns {Promise} 返回客户列表
   */
  getClients: () => {
    return request.get('/clients/');
  },

  /**
   * 获取所有客户（处理分页）
   * @returns {Promise<{ data: Array }>} 返回全量客户列表
   */
  getAllClients: async () => {
    return fetchAllPages(request, '/clients/');
  },

  /**
   * 获取单个客户详情
   * @param {number} id 客户ID
   * @returns {Promise} 返回客户详情
   */
  getClient: (id) => {
    return request.get(`/clients/${id}/`);
  },

  /**
   * 创建客户
   * @param {Object} data 客户数据
   * @returns {Promise} 返回创建结果
   */
  createClient: (data) => {
    return request.post('/clients/', data);
  },

  /**
   * 更新客户信息
   * @param {number} id 客户ID
   * @param {Object} data 更新的数据
   * @returns {Promise} 返回更新结果
   */
  updateClient: (id, data) => {
    return request.put(`/clients/${id}/`, data);
  },

  /**
   * 删除客户
   * @param {number} id 客户ID
   * @returns {Promise} 返回删除结果
   */
  deleteClient: (id) => {
    return request.delete(`/clients/${id}/`);
  }
};

/**
 * 授权单位API服务
 */
const authorizedOrgAPI = {
  /**
   * 获取所有授权单位
   * @returns {Promise} 返回授权单位列表
   */
  getAuthorizedOrgs: () => {
    return request.get('/authorized-orgs/');
  },

  /**
   * 获取单个授权单位详情
   * @param {number} id 授权单位ID
   * @returns {Promise} 返回授权单位详情
   */
  getAuthorizedOrg: (id) => {
    return request.get(`/authorized-orgs/${id}/`);
  },

  /**
   * 创建授权单位
   * @param {Object} data 授权单位数据
   * @returns {Promise} 返回创建结果
   */
  createAuthorizedOrg: (data) => {
    return request.post('/authorized-orgs/', data);
  },

  /**
   * 更新授权单位信息
   * @param {number} id 授权单位ID
   * @param {Object} data 更新的数据
   * @returns {Promise} 返回更新结果
   */
  updateAuthorizedOrg: (id, data) => {
    return request.put(`/authorized-orgs/${id}/`, data);
  },

  /**
   * 删除授权单位
   * @param {number} id 授权单位ID
   * @returns {Promise} 返回删除结果
   */
  deleteAuthorizedOrg: (id) => {
    return request.delete(`/authorized-orgs/${id}/`);
  }
};

/**
 * 值班人员API服务
 */
const dutyPersonnelAPI = {
  /**
   * 获取所有值班人员
   * @returns {Promise} 返回值班人员列表
   */
  getDutyPersonnel: () => {
    return request.get('/duty-personnel/');
  },

  /**
   * 获取单个值班人员详情
   * @param {number} id 值班人员ID
   * @returns {Promise} 返回值班人员详情
   */
  getDutyPerson: (id) => {
    return request.get(`/duty-personnel/${id}/`);
  },

  /**
   * 创建值班人员
   * @param {Object} data 值班人员数据
   * @returns {Promise} 返回创建结果
   */
  createDutyPerson: (data) => {
    return request.post('/duty-personnel/', data);
  },

  /**
   * 更新值班人员信息
   * @param {number} id 值班人员ID
   * @param {Object} data 更新的数据
   * @returns {Promise} 返回更新结果
   */
  updateDutyPerson: (id, data) => {
    return request.put(`/duty-personnel/${id}/`, data);
  },

  /**
   * 删除值班人员
   * @param {number} id 值班人员ID
   * @returns {Promise} 返回删除结果
   */
  deleteDutyPerson: (id) => {
    return request.delete(`/duty-personnel/${id}/`);
  },

  /**
   * 值班人员注册
   * @param {Object} data 注册数据
   * @returns {Promise} 返回注册结果
   */
  register: (data) => {
    return request.post('/duty-personnel/register/', data);
  },

  /**
   * 获取待审核列表（仅管理员）
   * @returns {Promise} 返回待审核列表
   */
  pendingApprovals: () => {
    return request.get('/duty-personnel/pending_approvals/');
  },

  /**
   * 审核通过（仅管理员）
   * @param {number} id 值班人员ID
   * @returns {Promise} 返回审核结果
   */
  approve: (id) => {
    return request.post(`/duty-personnel/${id}/approve/`);
  },

  /**
   * 审核拒绝（仅管理员）
   * @param {number} id 值班人员ID
   * @param {string} rejectionReason 拒绝原因
   * @returns {Promise} 返回审核结果
   */
  reject: (id, rejectionReason) => {
    return request.post(`/duty-personnel/${id}/reject/`, {
      rejection_reason: rejectionReason
    });
  }
};

/**
 * 历史记录API服务
 */
const historyAPI = {
  /**
   * 获取历史记录列表
   * @param {Object} params 查询参数
   * @returns {Promise} 返回历史记录列表
   */
  list: (params = {}) => {
    return request.get('/history/', { params });
  },

  /**
   * 获取单个历史记录详情
   * @param {number} id 历史记录ID
   * @returns {Promise} 返回历史记录详情
   */
  get: (id) => {
    return request.get(`/history/${id}/`);
  },

  /**
   * 回退到指定历史版本（仅管理员）
   * @param {number} id 历史记录ID
   * @returns {Promise} 返回回退结果
   */
  revert: (id) => {
    return request.post(`/history/${id}/revert/`, {});
  },

  /**
   * 批量回退（仅管理员）
   * @param {Array<number>} historyIds 历史记录ID数组
   * @returns {Promise} 返回批量回退结果
   */
  batchRevert: (historyIds) => {
    return request.post('/history/batch_revert/', {
      history_ids: historyIds
    });
  },

  /**
   * 获取值班人员操作记录详情
   * @param {number} days - 统计天数，默认30天
   * @param {string} action - 操作类型筛选（可选：create, update, delete）
   * @param {string} contentType - 内容类型筛选（可选：events.Event, devices.Device等）
   * @returns {Promise} 返回操作记录列表
   */
  getDutyPersonnelStats: (days = 30, action = '', contentType = '') => {
    const params = { days };
    if (action) params.action = action;
    if (contentType) params.content_type = contentType;
    return request.get('/history/duty_personnel_stats/', { params });
  }
};

/**
 * 站内消息API服务
 */
const notificationAPI = {
  /**
   * 获取消息列表
   * @param {Object} params - 查询参数（page, page_size等）
   * @returns {Promise} 返回消息列表
   */
  list: (params = {}) => {
    return request.get('/notifications/', { params });
  },

  /**
   * 获取未读消息数量
   * @returns {Promise} 返回未读消息数量
   */
  unreadCount: () => {
    return request.get('/notifications/unread_count/');
  },

  /**
   * 标记单条消息为已读
   * @param {number} id 消息ID
   * @returns {Promise} 返回操作结果
   */
  markRead: (id) => {
    return request.post(`/notifications/${id}/mark_read/`);
  },

  /**
   * 标记所有消息为已读
   * @returns {Promise} 返回操作结果
   */
  markAllRead: () => {
    return request.post('/notifications/mark_all_read/');
  }
};

/**
 * 用户API服务
 */
const userAPI = {
  /**
   * 获取当前用户信息
   * @returns {Promise} 返回用户信息
   */
  getCurrentUser: () => {
    return request.get('/users/me/');
  },
  
  /**
   * 更新用户个人资料
   * @param {Object} data - 用户资料数据
   * @returns {Promise} 更新结果
   */
  updateProfile: (data) => {
    return request.post('/users/update_profile/', data);
  },
  
  /**
   * 修改密码
   * @param {Object} data - 包含旧密码和新密码的对象
   * @returns {Promise} 修改结果
   */
  changePassword: (data) => {
    return request.post('/users/change_password/', data);
  },
  
  /**
   * 用户登录
   * @param {Object} credentials - 登录凭证
   * @returns {Promise} 登录结果，包含令牌
   */
  login: (credentials) => {
    return request.post('/auth/login/', credentials);
  },
  
  /**
   * 刷新访问令牌
   * @param {string} refreshToken - 刷新令牌
   * @returns {Promise} 刷新结果，包含新的访问令牌
   */
  refreshToken: (refreshToken) => {
    return request.post('/auth/refresh/', { refresh: refreshToken });
  },
  
  /**
   * 用户注册
   * @param {Object} userData - 用户注册数据
   * @returns {Promise} 注册结果
   */
  register: (userData) => {
    return request.post('/auth/register/', userData);
  }
};

// 导出所有API服务
export {
  deviceAPI,
  roomAPI,
  cabinetAPI,
  eventAPI,
  entryPersonnelAPI,
  decommissionedDeviceAPI,
  deviceAlertAPI,
  clientAPI,
  authorizedOrgAPI,
  dutyPersonnelAPI,
  userAPI,
  pduDeviceAPI,
  pduPortAPI,
  pduDataAPI,
  historyAPI,
  notificationAPI,
  warehouseDeviceAPI,
  operationStoryImportAPI,
  reportAPI
};

// 默认导出合并的API服务对象
const api = {
  ...deviceAPI,
  ...roomAPI,
  ...cabinetAPI,
  ...eventAPI,
  ...entryPersonnelAPI,
  ...decommissionedDeviceAPI,
  ...deviceAlertAPI,
  ...clientAPI,
  ...authorizedOrgAPI,
  ...dutyPersonnelAPI,
  ...userAPI,
  ...pduDeviceAPI,
  ...pduPortAPI,
  ...pduDataAPI,
  ...historyAPI,
  ...notificationAPI,
  ...warehouseDeviceAPI,
  ...operationStoryImportAPI,
  ...reportAPI
};

export default api;
