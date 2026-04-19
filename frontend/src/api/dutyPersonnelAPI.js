import request from './axios';

/**
 * 值班人员API服务
 */
const dutyPersonnelAPI = {
  /**
   * 获取所有值班人员
   * @returns {Promise} 返回值班人员列表
   */
  getDutyPersonnel: () => {
    return request.get('/api/duty-personnel/');
  },

  /**
   * 获取单个值班人员详情
   * @param {number} id 值班人员ID
   * @returns {Promise} 返回值班人员详情
   */
  getDutyPersonnelById: (id) => {
    return request.get(`/api/duty-personnel/${id}/`);
  },

  /**
   * 创建值班人员
   * @param {Object} data 值班人员数据
   * @returns {Promise} 返回创建结果
   */
  createDutyPersonnel: (data) => {
    return request.post('/api/duty-personnel/', data);
  },

  /**
   * 更新值班人员
   * @param {number} id 值班人员ID
   * @param {Object} data 值班人员数据
   * @returns {Promise} 返回更新结果
   */
  updateDutyPersonnel: (id, data) => {
    return request.put(`/api/duty-personnel/${id}/`, data);
  },

  /**
   * 删除值班人员
   * @param {number} id 值班人员ID
   * @returns {Promise} 返回删除结果
   */
  deleteDutyPersonnel: (id) => {
    return request.delete(`/api/duty-personnel/${id}/`);
  }
};

export default dutyPersonnelAPI; 