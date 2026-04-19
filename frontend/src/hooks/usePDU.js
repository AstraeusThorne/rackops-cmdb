import { useState, useEffect, useCallback, useRef } from 'react';
import { pduPortAPI, pduDataAPI } from '../api/pduAPI';
import { aggregatePDUDataByCircuit, transformPDUDataToCabinetFormat, extractArrayFromResponse } from '../utils/pduDataTransform';

/**
 * 获取机柜PDU数据的Hook
 * @param {number|string} cabinetId - 机柜ID
 * @param {Object} options - 配置选项
 * @param {boolean} options.autoRefresh - 是否自动刷新
 * @param {number} options.refreshInterval - 刷新间隔（毫秒），默认30000（30秒）
 * @param {Object} options.cabinetInfo - 机柜基本信息（用于数据转换）
 * @returns {Object} { data, loading, error, refetch, transformedData }
 */
export const useCabinetPDU = (cabinetId, options = {}) => {
  const {
    autoRefresh = false,
    refreshInterval = 30000,
    cabinetInfo = {}
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!cabinetId) {
      setLoading(false);
      setData(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // 确保cabinetId是数字
      const id = typeof cabinetId === 'string' ? parseInt(cabinetId, 10) : cabinetId;
      
      // 获取机柜的PDU端口
      const portsResponse = await pduPortAPI.getPortsByCabinet(id);
      
      // 从响应中提取端口数组
      const ports = extractArrayFromResponse(portsResponse, 'data');
      
      if (ports.length === 0) {
        setData(null);
        setLoading(false);
        return;
      }

      // 获取每个端口的最新数据
      const portDataPromises = ports.map(async (port) => {
        try {
          const dataResponse = await pduDataAPI.getLatestPDUData({ 
            pdu_port: port.id 
          });
          
          // 使用统一的响应提取函数
          const portData = extractArrayFromResponse(dataResponse, 'data');
          
          return {
            port,
            data: portData
          };
        } catch (err) {
          console.error(`Error fetching data for port ${port.id}:`, err);
          return { port, data: [] };
        }
      });

      const portData = await Promise.all(portDataPromises);
      
      // 按电路类型分组
      const aggregatedData = aggregatePDUDataByCircuit(portData);
      
      setData(aggregatedData);
    } catch (err) {
      console.error('Error fetching cabinet PDU data:', err);
      setError(err.message || '获取PDU数据失败');
    } finally {
      setLoading(false);
    }
  }, [cabinetId]);

  // 转换数据为组件格式
  const transformedData = useCallback(() => {
    if (!data) {
      return null;
    }

    const info = {
      id: cabinetId,
      name: cabinetInfo.name,
      location: cabinetInfo.location,
      room: cabinetInfo.room
    };

    return transformPDUDataToCabinetFormat(data, info);
  }, [data, cabinetId, cabinetInfo]);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        fetchData();
      }, refreshInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [autoRefresh, refreshInterval, fetchData]);

  // 初始加载
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { 
    data, 
    loading, 
    error, 
    refetch: fetchData,
    transformedData: transformedData()
  };
};

/**
 * 获取PDU历史数据的Hook
 * @param {number|string} portId - PDU端口ID
 * @param {string} dataType - 数据类型 (current, power, energy, thd_current, switch_status)
 * @param {string|Date} startTime - 开始时间（ISO格式字符串或Date对象）
 * @param {string|Date} endTime - 结束时间（ISO格式字符串或Date对象）
 * @returns {Object} { data, loading, error, refetch }
 */
export const usePDUHistory = (portId, dataType, startTime, endTime) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async () => {
    if (!portId || !dataType || !startTime || !endTime) {
      setData([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // 转换为ISO格式字符串
      const startISO = startTime instanceof Date 
        ? startTime.toISOString() 
        : startTime;
      const endISO = endTime instanceof Date 
        ? endTime.toISOString() 
        : endTime;

      const response = await pduDataAPI.getHistoryData(
        portId, 
        dataType, 
        startISO, 
        endISO
      );
      
      setData(response.data || []);
    } catch (err) {
      console.error('Error fetching PDU history:', err);
      setError(err.message || '获取历史数据失败');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [portId, dataType, startTime, endTime]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { 
    data, 
    loading, 
    error, 
    refetch: fetchHistory 
  };
};

/**
 * 获取机房所有机柜的PDU数据
 * @param {number|string} roomId - 机房ID
 * @param {Object} options - 配置选项
 * @returns {Object} { data, loading, error, refetch, cabinets }
 */
export const useRoomPDU = (roomId, options = {}) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!roomId) {
      setLoading(false);
      setData([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // 获取机房的所有机柜（需要从cabinetAPI获取）
      // 这里假设可以通过room参数过滤机柜
      // 实际实现可能需要先获取机柜列表，然后获取每个机柜的PDU数据
      
      // 由于需要机柜列表，这里先返回空数组
      // 实际使用时，应该在调用此Hook的组件中先获取机柜列表
      setData([]);
    } catch (err) {
      console.error('Error fetching room PDU data:', err);
      setError(err.message || '获取机房PDU数据失败');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { 
    data, 
    loading, 
    error, 
    refetch: fetchData 
  };
};

/**
 * 实时数据轮询Hook
 * @param {Array<number|string>} portIds - PDU端口ID数组
 * @param {Object} options - 配置选项
 * @param {number} options.interval - 轮询间隔（毫秒），默认5000（5秒）
 * @param {boolean} options.enabled - 是否启用轮询，默认true
 * @returns {Object} { data, loading, error, stop, start }
 */
export const usePDURealtime = (portIds = [], options = {}) => {
  const {
    interval = 5000,
    enabled = true
  } = options;

  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const isActiveRef = useRef(false);

  const fetchRealtimeData = useCallback(async () => {
    if (!portIds || portIds.length === 0) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 并行获取所有端口的数据
      const promises = portIds.map(async (portId) => {
        try {
          const response = await pduDataAPI.getLatestPDUData({ 
            pdu_port: portId 
          });
          return {
            portId,
            data: response.data || []
          };
        } catch (err) {
          console.error(`Error fetching realtime data for port ${portId}:`, err);
          return {
            portId,
            data: [],
            error: err.message
          };
        }
      });

      const results = await Promise.all(promises);
      
      // 转换为以portId为key的对象
      const dataMap = {};
      results.forEach(({ portId, data: portData }) => {
        dataMap[portId] = portData;
      });

      setData(dataMap);
    } catch (err) {
      console.error('Error fetching realtime PDU data:', err);
      setError(err.message || '获取实时数据失败');
    } finally {
      setLoading(false);
    }
  }, [portIds]);

  const start = useCallback(() => {
    if (isActiveRef.current) {
      return;
    }

    isActiveRef.current = true;
    fetchRealtimeData();

    if (interval > 0) {
      intervalRef.current = setInterval(() => {
        if (isActiveRef.current) {
          fetchRealtimeData();
        }
      }, interval);
    }
  }, [fetchRealtimeData, interval]);

  const stop = useCallback(() => {
    isActiveRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (enabled && portIds.length > 0) {
      start();
    } else {
      stop();
    }

    return () => {
      stop();
    };
  }, [enabled, portIds.length, start, stop]);

  return { 
    data, 
    loading, 
    error, 
    stop, 
    start,
    refetch: fetchRealtimeData
  };
};

