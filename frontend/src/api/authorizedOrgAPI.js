import request from './axios';

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

export default authorizedOrgAPI; 