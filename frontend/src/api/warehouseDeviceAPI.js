/**
 * 仓库设备API
 * 提供仓库设备相关的API请求方法
 */
import axios from './axios';

export const warehouseDeviceAPI = {
  /**
   * 获取所有仓库设备列表
   * @param {Object} params - 查询参数
   * @returns {Promise} 仓库设备列表Promise
   */
  getWarehouseDevices: (params) => {
    return axios.get('/warehouse-devices/', { params });
  },

  /**
   * 获取单个仓库设备详情
   * @param {number} id - 仓库设备ID
   * @returns {Promise} 仓库设备详情Promise
   */
  getWarehouseDevice: (id) => {
    return axios.get(`/warehouse-devices/${id}/`);
  },

  /**
   * 创建仓库设备
   * @param {Object} deviceData - 仓库设备数据对象
   * @returns {Promise} 创建结果Promise
   */
  createWarehouseDevice: (deviceData) => {
    return axios.post('/warehouse-devices/', deviceData);
  },

  /**
   * 更新仓库设备信息
   * @param {number} id - 仓库设备ID
   * @param {Object} deviceData - 仓库设备数据对象
   * @returns {Promise} 更新结果Promise
   */
  updateWarehouseDevice: (id, deviceData) => {
    return axios.put(`/warehouse-devices/${id}/`, deviceData);
  },

  /**
   * 删除仓库设备
   * @param {number} id - 仓库设备ID
   * @returns {Promise} 删除结果Promise
   */
  deleteWarehouseDevice: (id) => {
    return axios.delete(`/warehouse-devices/${id}/`);
  },

  /**
   * 上架设备（从仓库上架到机柜）
   * @param {number} id - 仓库设备ID
   * @param {Object} installData - 上架数据对象
   * @returns {Promise} 上架结果Promise
   */
  installDevice: (id, installData) => {
    return axios.post(`/warehouse-devices/${id}/install/`, installData);
  },

  /**
   * 设备出库
   * @param {number} id - 仓库设备ID
   * @param {Object} outData - 出库数据对象
   * @returns {Promise} 出库结果Promise
   */
  outOfWarehouse: (id, outData) => {
    return axios.post(`/warehouse-devices/${id}/out_of_warehouse/`, outData);
  },

  /**
   * 批量关联仓库设备到事件
   * @param {Object} data - 包含event_id和warehouse_device_ids
   * @returns {Promise} 关联结果Promise
   */
  batchAssociateWarehouseDevices: (data) => {
    return axios.post('/event-warehouse-devices/batch_create/', data);
  },

  /**
   * 获取仓库设备历史记录
   * @param {Object} params - 查询参数（可包含warehouse_device）
   * @returns {Promise} 历史记录列表Promise
   */
  getWarehouseDeviceHistory: (params) => {
    return axios.get('/warehouse-device-history/', { params });
  }
};

