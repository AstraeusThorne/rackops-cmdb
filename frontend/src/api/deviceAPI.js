import request from './axios';

/**
 * 设备API服务
 */
const deviceAPI = {
  /**
   * 获取设备列表（支持分页）
   * @param {Object} [params] - 查询参数，如 { page: 1, page_size: 20 }
   * @returns {Promise} 返回设备列表，含 count、results
   */
  getDevices: (params) => {
    return request.get('/devices/', { params: params || {} });
  },

  /**
   * 获取单个设备详情
   * @param {number} id 设备ID
   * @returns {Promise} 返回设备详情
   */
  getDevice: (id) => {
    return request.get(`/devices/${id}/`);
  }
};

export default deviceAPI; 