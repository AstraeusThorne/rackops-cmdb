import request from './axios';

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
   * 删除下架设备
   * @param {number} id 下架设备ID
   * @returns {Promise} 返回删除结果
   */
  deleteDecommissionedDevice: (id) => {
    return request.delete(`/decommissioned-devices/${id}/`);
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
   * 创建下架设备记录
   * @param {Object} data 下架设备数据
   * @returns {Promise} 返回创建结果
   */
  createDecommissionedDevice: (data) => {
    return request.post('/decommissioned-devices/', data);
  },

  /**
   * 关联下架设备与事件
   * @param {number} deviceId 下架设备ID
   * @param {number} eventId 事件ID
   * @param {Object} data 关联数据（可选）
   * @returns {Promise} 返回关联结果
   */
  associateWithEvent: (deviceId, eventId, data = {}) => {
    return request.post('/event-decommissioned-devices/', {
      decommissioned_device: deviceId,
      event: eventId,
      ...data
    });
  },

  /**
   * 批量关联下架设备与事件
   * @param {number} eventId 事件ID
   * @param {Array<number>} deviceIds 下架设备ID数组
   * @returns {Promise} 返回批量关联结果
   */
  batchAssociateWithEvent: (eventId, deviceIds) => {
    return request.post('/event-decommissioned-devices/batch_create/', {
      event_id: eventId,
      decommissioned_device_ids: deviceIds
    });
  },

  /**
   * 解除下架设备与事件的关联
   * @param {number} deviceId 下架设备ID
   * @param {number} eventId 事件ID
   * @returns {Promise} 返回解除关联结果
   */
  removeEventAssociation: (deviceId, eventId) => {
    return request.post('/event-decommissioned-devices/remove_association/', {
      decommissioned_device: deviceId,
      event: eventId
    });
  }
};

export default decommissionedDeviceAPI; 