import request from './axios';
import { fetchAllPages } from './pagination';

/**
 * 机柜API服务
 */
const cabinetAPI = {
  /**
   * 获取所有机柜
   * @returns {Promise} 返回机柜列表
   */
  getCabinets: () => {
    return request.get('/cabinets/');
  },

  /**
   * 获取所有机柜数据（处理分页）
   * 使用 page 参数逐页请求，避免解析 next URL 导致重复请求同一页、分页错乱或 ID 显示异常。
   * @returns {Promise<{ data: Array }>} 返回所有机柜列表
   */
  getAllCabinets: async () => {
    return fetchAllPages(request, '/cabinets/');
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
  }
};

export default cabinetAPI;
