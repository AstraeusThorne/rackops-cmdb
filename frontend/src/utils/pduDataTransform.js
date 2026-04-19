/**
 * PDU数据转换工具
 * 将PDU API返回的数据转换为前端组件所需的数据格式
 */

import { alertThresholds } from '../data/powerMonitoringData';

/**
 * 从API响应中提取数组数据
 * 处理不同的响应格式：可能是数组、分页对象或空值
 * @param {Object} response - API响应对象
 * @param {string} dataPath - 数据路径，默认为 'data'
 * @returns {Array} 提取的数组数据
 */
export const extractArrayFromResponse = (response, dataPath = 'data') => {
  if (!response) {
    return [];
  }

  let data = response;
  
  // 如果指定了路径，则从响应中提取
  if (dataPath && response[dataPath] !== undefined) {
    data = response[dataPath];
  }

  // 如果是分页格式 { results: [...], count: ... }
  if (data && data.results && Array.isArray(data.results)) {
    return data.results;
  }
  
  // 如果是直接数组格式
  if (Array.isArray(data)) {
    return data;
  }
  
  // 如果 data 不是数组，记录警告并返回空数组
  if (data !== null && data !== undefined) {
    console.warn('Unexpected response format, expected array:', data);
  }
  
  return [];
};

/**
 * 从PDU数据中获取指定类型的数据值
 * @param {Array} dataItems - PDU数据项数组
 * @param {string} dataType - 数据类型 (current, power, energy, thd_current, switch_status)
 * @returns {number|string} 数据值，如果没有则返回0（switch_status返回0或1）
 */
const getValueByType = (dataItems, dataType) => {
  if (!dataItems || !Array.isArray(dataItems)) {
    return 0;
  }
  
  const item = dataItems.find(d => d.data_type === dataType);
  if (item && item.value !== undefined && item.value !== null) {
    // 开关状态特殊处理：返回数字0或1（1=开启，0=关闭）
    if (dataType === 'switch_status') {
      // 处理各种可能的格式：数字1、字符串"1"、Decimal "1.0000"等
      const numValue = parseFloat(item.value);
      // 如果解析后的数字等于1（或接近1，考虑浮点数精度），则认为是开启
      if (numValue === 1 || Math.abs(numValue - 1) < 0.0001) {
        return 1; // 开启
      }
      // 也检查字符串格式
      const strValue = String(item.value).trim().toLowerCase();
      if (strValue === '1' || strValue === 'true' || strValue === 'on' || strValue === 'yes') {
        return 1; // 开启
      }
      // 其他值都表示关闭
      return 0; // 关闭
    }
    // 其他数据类型返回浮点数
    return parseFloat(item.value) || 0;
  }
  return 0;
};

/**
 * 根据数据值计算状态
 * @param {number} current - 电流值
 * @param {number} power - 功率值
 * @param {number} temperature - 温度值（可选）
 * @returns {string} 状态 (normal, warning, critical, offline)
 */
const calculateStatus = (current, power, temperature = null) => {
  // 如果所有值都为0，可能是离线状态
  if (current === 0 && power === 0) {
    return 'offline';
  }
  
  // 检查是否超过严重阈值
  if (current >= alertThresholds.current.critical || 
      power >= alertThresholds.power.critical ||
      (temperature !== null && temperature >= alertThresholds.temperature.critical)) {
    return 'critical';
  }
  
  // 检查是否超过警告阈值
  if (current >= alertThresholds.current.warning || 
      power >= alertThresholds.power.warning ||
      (temperature !== null && temperature >= alertThresholds.temperature.warning)) {
    return 'warning';
  }
  
  return 'normal';
};

/**
 * 按A/B路分组聚合PDU数据
 * @param {Array} portData - 端口数据数组，每个元素包含 {port, data}
 * @returns {Object} 分组后的数据 {circuitA: {...}, circuitB: {...}}
 */
export const aggregatePDUDataByCircuit = (portData) => {
  const result = {
    circuitA: {
      ports: [],
      data: {}
    },
    circuitB: {
      ports: [],
      data: {}
    }
  };

  if (!portData || !Array.isArray(portData)) {
    return result;
  }

  portData.forEach(({ port, data }) => {
    if (!port || !port.pdu_device_name) {
      return;
    }

    // 根据PDU设备名称判断电路类型
    // 假设设备名称包含PDUA表示A路，PDUB表示B路
    const circuitType = port.pdu_device_name.includes('PDUA') || 
                       port.pdu_device_name.includes('PDU-A') ||
                       port.pdu_device_name.includes('A路') ? 'A' :
                       port.pdu_device_name.includes('PDUB') || 
                       port.pdu_device_name.includes('PDU-B') ||
                       port.pdu_device_name.includes('B路') ? 'B' : null;

    if (circuitType) {
      const circuitKey = `circuit${circuitType}`;
      result[circuitKey].ports.push(port);

      // 按数据类型组织数据
      if (data && Array.isArray(data)) {
        data.forEach(item => {
          if (!result[circuitKey].data[item.data_type]) {
            result[circuitKey].data[item.data_type] = [];
          }
          result[circuitKey].data[item.data_type].push(item);
        });
      }
    }
  });

  return result;
};

/**
 * 根据阈值计算机柜状态
 * @param {Object} pduData - 聚合后的PDU数据
 * @returns {string} 状态 (normal, warning, critical, offline)
 */
export const calculateCabinetStatus = (pduData) => {
  if (!pduData) {
    return 'offline';
  }

  const circuitA = pduData.circuitA || { data: {} };
  const circuitB = pduData.circuitB || { data: {} };

  // 获取A路和B路的数据
  const currentA = getValueByType(circuitA.data.current || [], 'current');
  const powerA = getValueByType(circuitA.data.power || [], 'power');
  const currentB = getValueByType(circuitB.data.current || [], 'current');
  const powerB = getValueByType(circuitB.data.power || [], 'power');

  // 计算总电流和总功率
  const totalCurrent = currentA + currentB;
  const totalPower = powerA + powerB;

  // 根据总电流和总功率计算状态
  return calculateStatus(totalCurrent, totalPower);
};

/**
 * 将PDU API数据转换为CabinetPowerCard组件所需格式
 * @param {Object} pduData - 聚合后的PDU数据（来自aggregatePDUDataByCircuit）
 * @param {Object} cabinetInfo - 机柜基本信息 {id, name, location, room}
 * @returns {Object} 转换后的机柜数据格式
 */
export const transformPDUDataToCabinetFormat = (pduData, cabinetInfo = {}) => {
  if (!pduData) {
    return null;
  }

  const circuitA = pduData.circuitA || { data: {} };
  const circuitB = pduData.circuitB || { data: {} };

  // 从数据中提取各种类型的值
  const getValue = (circuitData, dataType) => {
    const items = circuitData.data[dataType] || [];
    return getValueByType(items, dataType);
  };

  // 获取A路数据（只获取需要的5个数据）
  const currentA = getValue(circuitA, 'current');
  const powerA = getValue(circuitA, 'power');
  const energyA = getValue(circuitA, 'energy');
  const thdCurrentA = getValue(circuitA, 'thd_current');
  const switchStatusA = getValue(circuitA, 'switch_status');
  
  // 获取B路数据（只获取需要的5个数据）
  const currentB = getValue(circuitB, 'current');
  const powerB = getValue(circuitB, 'power');
  const energyB = getValue(circuitB, 'energy');
  const thdCurrentB = getValue(circuitB, 'thd_current');
  const switchStatusB = getValue(circuitB, 'switch_status');

  // 计算总计
  const totalPower = powerA + powerB;
  const totalCurrent = currentA + currentB;
  const totalEnergy = energyA + energyB;

  // 计算状态
  const status = calculateCabinetStatus(pduData);
  const statusA = calculateStatus(currentA, powerA);
  const statusB = calculateStatus(currentB, powerB);

  // 构建返回数据
  return {
    cabinetId: cabinetInfo.id?.toString() || '',
    cabinetName: cabinetInfo.name || '未知机柜',
    location: cabinetInfo.location || '',
    room: cabinetInfo.room || '',
    status: status,
    lastUpdate: new Date().toISOString(),
    total: {
      power: totalPower,
      current: totalCurrent,
      energy: totalEnergy
    },
    circuitA: {
      status: statusA,
      current: currentA,
      power: powerA,
      energy: energyA,
      thdCurrent: thdCurrentA,
      switchStatus: switchStatusA
    },
    circuitB: {
      status: statusB,
      current: currentB,
      power: powerB,
      energy: energyB,
      thdCurrent: thdCurrentB,
      switchStatus: switchStatusB
    }
  };
};

/**
 * 格式化PDU历史数据为图表格式
 * @param {Array} rawData - 原始历史数据数组
 * @param {string} dataType - 数据类型
 * @returns {Array} 格式化后的图表数据
 */
export const formatPDUHistoryData = (rawData, dataType) => {
  if (!rawData || !Array.isArray(rawData)) {
    return [];
  }

  return rawData
    .filter(item => item.data_type === dataType)
    .map(item => ({
      time: new Date(item.timestamp).toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      timestamp: new Date(item.timestamp).getTime(),
      value: parseFloat(item.value) || 0,
      unit: item.unit || ''
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
};

/**
 * 格式化多个端口的历史数据为图表格式（用于对比）
 * @param {Array} rawDataArray - 多个端口的历史数据数组
 * @param {string} dataType - 数据类型
 * @param {Array} portNames - 端口名称数组（用于图例）
 * @returns {Array} 格式化后的图表数据
 */
export const formatMultiPortHistoryData = (rawDataArray, dataType, portNames = []) => {
  if (!rawDataArray || !Array.isArray(rawDataArray)) {
    return [];
  }

  // 按时间分组
  const timeMap = new Map();

  rawDataArray.forEach((portData, index) => {
    if (!portData || !Array.isArray(portData)) {
      return;
    }

    portData
      .filter(item => item.data_type === dataType)
      .forEach(item => {
        const timestamp = new Date(item.timestamp).getTime();
        const timeKey = timestamp;

        if (!timeMap.has(timeKey)) {
          timeMap.set(timeKey, {
            time: new Date(item.timestamp).toLocaleTimeString('zh-CN', { 
              hour: '2-digit', 
              minute: '2-digit' 
            }),
            timestamp: timestamp
          });
        }

        const portName = portNames[index] || `端口${index + 1}`;
        timeMap.get(timeKey)[portName] = parseFloat(item.value) || 0;
      });
  });

  // 转换为数组并排序
  return Array.from(timeMap.values())
    .sort((a, b) => a.timestamp - b.timestamp);
};

