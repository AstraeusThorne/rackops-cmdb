import request from './axios';
import { fetchAllPages } from './pagination';

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

export default clientAPI; 
