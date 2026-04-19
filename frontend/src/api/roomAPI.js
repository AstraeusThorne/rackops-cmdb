import request from './axios';

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

export default roomAPI; 