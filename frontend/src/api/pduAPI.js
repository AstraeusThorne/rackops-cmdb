import request from './axios';
import { extractArrayFromResponse } from '../utils/pduDataTransform';

/**
 * PDU设备API服务
 * 提供PDU设备相关的API请求方法
 */
const pduDeviceAPI = {
  /**
   * 获取所有PDU设备列表
   * @param {Object} params - 查询参数 {room, circuit_type}
   * @returns {Promise} PDU设备列表Promise
   */
  getPDUDevices: (params = {}) => {
    return request.get('/pdu-devices/', { params });
  },

  /**
   * 获取单个PDU设备详情
   * @param {number} id - PDU设备ID
   * @returns {Promise} PDU设备详情Promise
   */
  getPDUDevice: (id) => {
    return request.get(`/pdu-devices/${id}/`);
  },

  /**
   * 创建PDU设备
   * @param {Object} deviceData - PDU设备数据
   * @returns {Promise} 创建结果Promise
   */
  createPDUDevice: (deviceData) => {
    return request.post('/pdu-devices/', deviceData);
  },

  /**
   * 更新PDU设备信息
   * @param {number} id - PDU设备ID
   * @param {Object} deviceData - 更新数据
   * @returns {Promise} 更新结果Promise
   */
  updatePDUDevice: (id, deviceData) => {
    return request.put(`/pdu-devices/${id}/`, deviceData);
  },

  /**
   * 删除PDU设备
   * @param {number} id - PDU设备ID
   * @returns {Promise} 删除结果Promise
   */
  deletePDUDevice: (id) => {
    return request.delete(`/pdu-devices/${id}/`);
  }
};

/**
 * PDU端口API服务
 * 提供PDU端口相关的API请求方法
 */
const pduPortAPI = {
  /**
   * 获取所有PDU端口列表
   * @param {Object} params - 查询参数 {pdu_device, cabinet}
   * @returns {Promise} PDU端口列表Promise
   */
  getPDUPorts: (params = {}) => {
    return request.get('/pdu-ports/', { params });
  },

  /**
   * 获取单个PDU端口详情
   * @param {number} id - PDU端口ID
   * @returns {Promise} PDU端口详情Promise
   */
  getPDUPort: (id) => {
    return request.get(`/pdu-ports/${id}/`);
  },

  /**
   * 创建PDU端口
   * @param {Object} portData - PDU端口数据
   * @returns {Promise} 创建结果Promise
   */
  createPDUPort: (portData) => {
    return request.post('/pdu-ports/', portData);
  },

  /**
   * 更新PDU端口信息
   * @param {number} id - PDU端口ID
   * @param {Object} portData - 更新数据
   * @returns {Promise} 更新结果Promise
   */
  updatePDUPort: (id, portData) => {
    return request.put(`/pdu-ports/${id}/`, portData);
  },

  /**
   * 删除PDU端口
   * @param {number} id - PDU端口ID
   * @returns {Promise} 删除结果Promise
   */
  deletePDUPort: (id) => {
    return request.delete(`/pdu-ports/${id}/`);
  },

  /**
   * 根据机柜ID获取PDU端口
   * @param {number|string} cabinetId - 机柜ID
   * @returns {Promise} PDU端口列表Promise
   */
  getPortsByCabinet: (cabinetId) => {
    // 确保cabinetId是数字
    const id = typeof cabinetId === 'string' ? parseInt(cabinetId, 10) : cabinetId;
    return request.get('/pdu-ports/', { 
      params: { cabinet: id } 
    });
  },

  /**
   * 批量获取多个机柜的PDU端口
   * @param {Array<number>} cabinetIds - 机柜ID数组
   * @param {boolean} groupByCabinet - 是否按机柜分组（默认: true）
   * @returns {Promise} 批量PDU端口Promise
   * 
   * 返回格式（groupByCabinet=true时）:
   * {
   *   "cabinet_1": [端口数组],
   *   "cabinet_2": [端口数组],
   *   ...
   * }
   * 
   * 返回格式（groupByCabinet=false时）:
   * [所有端口的扁平数组]
   */
  getBatchPortsByCabinets: (cabinetIds, groupByCabinet = true) => {
    if (!cabinetIds || cabinetIds.length === 0) {
      return Promise.resolve({ data: groupByCabinet ? {} : [] });
    }

    const cabinetIdsStr = cabinetIds.join(',');
    return request.get('/pdu-ports/batch_by_cabinets/', {
      params: {
        cabinet_ids: cabinetIdsStr,
        group_by_cabinet: groupByCabinet
      }
    });
  }
};

/**
 * PDU数据API服务
 * 提供PDU数据相关的API请求方法
 */
const pduDataAPI = {
  /**
   * 获取PDU数据列表
   * @param {Object} params - 查询参数
   *   {pdu_port, data_type, start_time, end_time, source, import_batch}
   * @returns {Promise} PDU数据列表Promise
   */
  getPDUData: (params = {}) => {
    return request.get('/cabinet-pdu-data/', { params });
  },

  /**
   * 获取单个PDU数据详情
   * @param {number} id - PDU数据ID
   * @returns {Promise} PDU数据详情Promise
   */
  getPDUDataItem: (id) => {
    return request.get(`/cabinet-pdu-data/${id}/`);
  },

  /**
   * 创建PDU数据
   * @param {Object} data - PDU数据
   * @returns {Promise} 创建结果Promise
   */
  createPDUData: (data) => {
    return request.post('/cabinet-pdu-data/', data);
  },

  /**
   * 更新PDU数据
   * @param {number} id - PDU数据ID
   * @param {Object} data - 更新数据
   * @returns {Promise} 更新结果Promise
   */
  updatePDUData: (id, data) => {
    return request.put(`/cabinet-pdu-data/${id}/`, data);
  },

  /**
   * 删除PDU数据
   * @param {number} id - PDU数据ID
   * @returns {Promise} 删除结果Promise
   */
  deletePDUData: (id) => {
    return request.delete(`/cabinet-pdu-data/${id}/`);
  },

  /**
   * 获取最新PDU数据
   * @param {Object} params - 查询参数 {pdu_port, data_type}
   * @returns {Promise} 最新PDU数据Promise
   */
  getLatestPDUData: (params = {}) => {
    return request.get('/cabinet-pdu-data/latest/', { params });
  },

  /**
   * 获取指定端口的历史数据
   * @param {number} portId - PDU端口ID
   * @param {string} dataType - 数据类型 (current, power, energy, thd_current, switch_status)
   * @param {string} startTime - 开始时间 (ISO格式)
   * @param {string} endTime - 结束时间 (ISO格式)
   * @returns {Promise} 历史数据Promise
   */
  getHistoryData: (portId, dataType, startTime, endTime) => {
    return request.get('/cabinet-pdu-data/', {
      params: {
        pdu_port: portId,
        data_type: dataType,
        start_time: startTime,
        end_time: endTime
      }
    });
  },

  /**
   * 获取机柜的PDU数据（通过机柜ID查找关联的端口）
   * @param {number} cabinetId - 机柜ID
   * @param {string} dataType - 数据类型（可选）
   * @returns {Promise} PDU数据Promise
   */
  getCabinetPDUData: async (cabinetId, dataType = null) => {
    // 先获取该机柜的所有PDU端口
    const portsResponse = await pduPortAPI.getPortsByCabinet(cabinetId);
    
    // 从响应中提取端口数组
    const ports = extractArrayFromResponse(portsResponse, 'data');
    
    if (ports.length === 0) {
      return { data: [] };
    }

    // 获取所有端口的数据
    const portIds = ports.map(port => port.id);
    const allData = [];
    
    for (const portId of portIds) {
      try {
        const params = { pdu_port: portId };
        if (dataType) {
          params.data_type = dataType;
        }
        const dataResponse = await pduDataAPI.getLatestPDUData(params);
        if (dataResponse.data && Array.isArray(dataResponse.data)) {
          allData.push(...dataResponse.data);
        }
      } catch (error) {
        console.error(`Error fetching data for port ${portId}:`, error);
      }
    }
    
    return { data: allData };
  },

  /**
   * 批量获取多个机柜的PDU端口和数据（优化版）
   * @param {Array<number>} cabinetIds - 机柜ID数组
   * @param {string} dataType - 数据类型（可选，默认: power）
   * @returns {Promise} 批量PDU数据Promise
   * 
   * 返回格式:
   * {
   *   "cabinet_1": {
   *     "ports": [端口数组],
   *     "data": [数据数组]
   *   },
   *   "cabinet_2": { ... }
   * }
   */
  getBatchCabinetPDUData: async (cabinetIds, dataType = 'power') => {
    if (!cabinetIds || cabinetIds.length === 0) {
      return { data: {} };
    }

    try {
      // 批量获取所有机柜的端口
      const portsResponse = await pduPortAPI.getBatchPortsByCabinets(cabinetIds, true);
      const portsByCabinet = portsResponse.data || {};
      
      // 收集所有端口ID
      const allPortIds = [];
      const portToCabinetMap = {};
      
      Object.entries(portsByCabinet).forEach(([cabinetKey, ports]) => {
        const cabinetId = parseInt(cabinetKey.replace('cabinet_', ''));
        ports.forEach(port => {
          allPortIds.push(port.id);
          portToCabinetMap[port.id] = cabinetId;
        });
      });

      if (allPortIds.length === 0) {
        return { data: {} };
      }

      // 批量获取所有端口的数据（如果后端支持批量查询数据）
      // 否则使用现有的批量查询API
      const dataResponse = await pduDataAPI.getBatchLatestByCabinets(cabinetIds, dataType, false);
      const allData = extractArrayFromResponse(dataResponse, 'data') || [];

      // 按机柜组织数据
      const result = {};
      Object.entries(portsByCabinet).forEach(([cabinetKey, ports]) => {
        const cabinetId = parseInt(cabinetKey.replace('cabinet_', ''));
        const portIds = ports.map(p => p.id);
        const cabinetData = allData.filter(item => {
          const portId = item.pdu_port || item.pdu_port_id;
          return portIds.includes(portId);
        });

        result[cabinetKey] = {
          cabinet_id: cabinetId,
          ports: ports,
          data: cabinetData
        };
      });

      return { data: result };
    } catch (error) {
      console.error('Error fetching batch cabinet PDU data:', error);
      return { data: {} };
    }
  },

  /**
   * 批量获取多个机柜的最新PDU数据（按机柜聚合）
   * @param {Array<number>} cabinetIds - 机柜ID数组
   * @param {string} dataType - 数据类型（可选，默认: power）
   * @param {boolean} aggregate - 是否按机柜聚合（默认: true）
   * @returns {Promise} 批量PDU数据Promise
   * 
   * 返回格式（aggregate=true时）:
   * {
   *   "cabinet_1": {
   *     "cabinet_id": 1,
   *     "total_value": 1500.0,
   *     "unit": "W",
   *     "port_count": 2,
   *     "last_update": "2025-12-02T10:00:00Z"
   *   },
   *   "cabinet_2": { ... }
   * }
   */
  getBatchLatestByCabinets: (cabinetIds, dataType = 'power', aggregate = true) => {
    if (!cabinetIds || cabinetIds.length === 0) {
      return Promise.resolve({ data: {} });
    }

    const cabinetIdsStr = cabinetIds.join(',');
    return request.get('/cabinet-pdu-data/batch_latest_by_cabinets/', {
      params: {
        cabinet_ids: cabinetIdsStr,
        data_type: dataType,
        aggregate: aggregate
      }
    });
  },

  /**
   * 下载弱电数据导入 Excel 模板
   * 模板列：时间, 端口标识, 数据类型, 数值, 单位
   * @returns {Promise} 返回 blob，用于触发浏览器下载
   */
  downloadPduDataImportTemplate: () => {
    return request.get('/cabinet-pdu-data/download-import-template/', {
      responseType: 'blob',
    });
  },

  /**
   * 批量导入弱电数据（上传 JSON 或 Excel 文件）
   * @param {File} file - 文件（推荐：PDU导出_YYYYMMDD.json；也支持按模板整理的 Excel）
   * @returns {Promise} 导入结果 { created, failed, errors }
   */
  batchImportPduData: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request.post('/cabinet-pdu-data/batch-import/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // 导入可能较慢，单独放宽超时时间
      timeout: 600000, // 10 分钟
    });
  },
};

// 导出所有PDU API服务
export {
  pduDeviceAPI,
  pduPortAPI,
  pduDataAPI
};

// 默认导出合并的PDU API服务对象
const pduAPI = {
  ...pduDeviceAPI,
  ...pduPortAPI,
  ...pduDataAPI
};

export default pduAPI;
