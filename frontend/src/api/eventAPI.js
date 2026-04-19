import request from './axios';
import { fetchAllPages } from './pagination';

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
   * 获取所有事件（处理分页）
   * @returns {Promise<{ data: Array }>} 返回全量事件列表
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
   * 获取事件入场人员
   * @returns {Promise} 返回入场人员列表
   */
  getEntryPersonnel: () => {
    return request.get('/entry-personnel/');
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

export default eventAPI; 
