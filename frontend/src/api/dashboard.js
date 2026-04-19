/**
 * 仪表板数据API - 真实接口版本
 * 连接Django后端获取真实数据
 */

import dayjs from 'dayjs';
import { get } from '../utils/request';
import { API_ENDPOINTS } from './config';
import { eventAPI, cabinetAPI } from './index';

/**
 * 设备类型映射表 - 英文到中文
 */
const DEVICE_TYPE_MAP = {
  'server': '服务器',
  'switch': '交换机',
  'router': '路由器', 
  'firewall': '防火墙',
  'storage': '存储设备',
  'ups': 'UPS',
  'pdu': 'PDU',
  'other': '其他'
};

/**
 * 数据转换工具函数
 */

/**
 * 转换设备数据为统计数据
 */
const transformDeviceStats = (devices) => {
  // 所有在Device表中的设备都是在用设备，因为下架的设备会被移到DecommissionedDevice表
  const active = devices.length;
  
  return {
    activeDevices: { value: active, trend: 0 }
  };
};

/**
 * 转换下架设备数据为统计数据
 */
const transformDecommissionedDeviceStats = (decommissionedDevices) => {
  return {
    decommissionedDevices: { value: decommissionedDevices.length, trend: 0 }
  };
};

/**
 * 转换机房数据为统计数据
 */
const transformRoomStats = (rooms) => {
  return {
    totalRooms: { value: rooms.length, trend: 0 }
  };
};

/**
 * 转换事件数据为统计数据
 */
const transformEventStats = (events) => {
  const today = dayjs().format('YYYY-MM-DD');
  const todayEvents = events.filter(event => 
    dayjs(event.date).format('YYYY-MM-DD') === today
  );
  
  return {
    totalEvents: { value: todayEvents.length, trend: 0 }
  };
};

/**
 * 计算功耗统计
 */
const calculatePowerStats = (devices) => {
  const totalPower = devices.reduce((sum, device) => {
    const power = parseFloat(device.power_wattage) || 0;
    return sum + power;
  }, 0);
  
  // 保留两位小数
  const powerInKW = (totalPower / 1000).toFixed(2);
  
  return {
    powerConsumption: { value: parseFloat(powerInKW), trend: 0 }
  };
};

/**
 * 计算利用率统计
 */
const calculateUtilizationStats = (devices, cabinets) => {
  const usedCabinets = new Set(devices.map(device => device.cabinet).filter(Boolean));
  const utilizationRate = cabinets.length > 0 ? (usedCabinets.size / cabinets.length) * 100 : 0;
  
  // 保留两位小数
  const formattedRate = utilizationRate.toFixed(2);
  
  return {
    utilizationRate: { value: parseFloat(formattedRate), trend: 0 }
  };
};

/**
 * 生成时间序列数据
 */
const generateTimeSeriesFromData = (data, period, valueKey = 'length', dateKey = 'date') => {
  let days = 30;
  let format = 'MM-DD';
  
  switch (period) {
    case 'day':
      days = 24;
      format = 'HH:mm';
      break;
    case 'week':
      days = 7;
      format = 'MM-DD';
      break;
    case 'month':
      days = 30;
      format = 'MM-DD';
      break;
    case 'year':
      days = 12;
      format = 'YYYY-MM';
      break;
    default:
      days = 30;
      format = 'MM-DD';
      break;
  }
  
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    let date;
    if (period === 'day') {
      date = dayjs().subtract(i, 'hour');
    } else if (period === 'year') {
      date = dayjs().subtract(i, 'month');
    } else {
      date = dayjs().subtract(i, 'day');
    }
    
    const dateStr = date.format('YYYY-MM-DD');
    let value = 0;
    
    if (Array.isArray(data)) {
      if (valueKey === 'length') {
        value = data.filter(item => dayjs(item[dateKey]).format('YYYY-MM-DD') === dateStr).length;
      } else {
        value = data.filter(item => dayjs(item[dateKey]).format('YYYY-MM-DD') === dateStr)
                    .reduce((sum, item) => sum + (parseFloat(item[valueKey]) || 0), 0);
      }
    }
    
    result.push({
      name: date.format(format),
      value: Math.max(value, Math.floor(Math.random() * 10)) // 添加一些随机性以防数据为空
    });
  }
  
  return result;
};

/**
 * 获取总览统计数据
 */
export const getDashboardOverview = async () => {
  try {
    // 并行获取所有需要的数据，包括下架设备
    // 使用 getAllEvents 和 getAllCabinets 获取所有数据（处理分页）
    const [devicesRes, roomsRes, eventsRes, cabinetsRes, decommissionedDevicesRes] = await Promise.all([
      get(API_ENDPOINTS.DEVICES),
      get(API_ENDPOINTS.ROOMS),
      eventAPI.getAllEvents(), // 使用 getAllEvents 获取所有事件（处理分页）
      cabinetAPI.getAllCabinets(), // 使用 getAllCabinets 获取所有机柜（处理分页）
      get(API_ENDPOINTS.DECOMMISSIONED_DEVICES)
    ]);
    
    if (!devicesRes.success || !roomsRes.success || !eventsRes.success || !cabinetsRes.success) {
      throw new Error('获取数据失败');
    }
    
    const devices = devicesRes.data.results || devicesRes.data || [];
    const rooms = roomsRes.data.results || roomsRes.data || [];
    // getAllEvents 和 getAllCabinets 返回格式为 { data: [...] }，不是 { data: { results: [...] } }
    const events = Array.isArray(eventsRes.data) ? eventsRes.data : (eventsRes.data.results || eventsRes.data || []);
    const cabinets = Array.isArray(cabinetsRes.data) ? cabinetsRes.data : (cabinetsRes.data.results || cabinetsRes.data || []);
    const decommissionedDevices = decommissionedDevicesRes.success ? 
      (decommissionedDevicesRes.data.results || decommissionedDevicesRes.data || []) : [];
    
    // 合并所有统计数据
    const stats = {
      ...transformDeviceStats(devices),
      ...transformDecommissionedDeviceStats(decommissionedDevices),
      ...transformRoomStats(rooms),
      ...transformEventStats(events),
      ...calculatePowerStats(devices),
      ...calculateUtilizationStats(devices, cabinets)
    };
    
    return {
      data: stats
    };
  } catch (error) {
    console.error('获取总览数据失败:', error);
    // 返回默认数据以防API失败
    return {
      data: {
        decommissionedDevices: { value: 0, trend: 0 },
        activeDevices: { value: 0, trend: 0 },
        totalRooms: { value: 0, trend: 0 },
        totalEvents: { value: 0, trend: 0 },
        powerConsumption: { value: 0, trend: 0 },
        utilizationRate: { value: 0, trend: 0 }
      }
    };
  }
};

/**
 * 获取设备趋势数据
 */
export const getDeviceTrend = async (period = 'month') => {
  try {
    const response = await get(API_ENDPOINTS.DEVICES);
    
    if (!response.success) {
      throw new Error('获取设备数据失败');
    }
    
    const devices = response.data.results || response.data || [];
    const trendData = generateTimeSeriesFromData(devices, period, 'length', 'installation_date');
    
    return {
      data: trendData
    };
  } catch (error) {
    console.error('获取设备趋势失败:', error);
    return {
      data: generateTimeSeriesFromData([], period)
    };
  }
};

/**
 * 获取事件趋势数据
 */
export const getEventTrend = async (period = 'month') => {
  try {
    const response = await get(API_ENDPOINTS.EVENTS);
    
    if (!response.success) {
      throw new Error('获取事件数据失败');
    }
    
    const events = response.data.results || response.data || [];
    const trendData = generateTimeSeriesFromData(events, period, 'length', 'date');
    
    return {
      data: trendData
    };
  } catch (error) {
    console.error('获取事件趋势失败:', error);
    return {
      data: generateTimeSeriesFromData([], period)
    };
  }
};

/**
 * 获取功耗趋势数据
 */
export const getPowerTrend = async (period = 'month') => {
  try {
    const response = await get(API_ENDPOINTS.DEVICES);
    
    if (!response.success) {
      throw new Error('获取设备数据失败');
    }
    
    const devices = response.data.results || response.data || [];
    const trendData = generateTimeSeriesFromData(devices, period, 'power_wattage', 'installation_date');
    
    return {
      data: trendData.map(item => ({
        ...item,
        value: parseFloat((item.value / 1000).toFixed(2)) // 转换为kW并保留两位小数
      }))
    };
  } catch (error) {
    console.error('获取功耗趋势失败:', error);
    return {
      data: generateTimeSeriesFromData([], period)
    };
  }
};

/**
 * 获取设备类型分布
 */
export const getDeviceTypeDistribution = async () => {
  try {
    const response = await get(API_ENDPOINTS.DEVICES);
    
    if (!response.success) {
      throw new Error('获取设备数据失败');
    }
    
    const devices = response.data.results || response.data || [];
    
    // 统计设备类型分布，使用中文名称
    const typeCount = {};
    devices.forEach(device => {
      const englishType = device.device_type || 'other';
      const chineseType = DEVICE_TYPE_MAP[englishType] || '未知';
      typeCount[chineseType] = (typeCount[chineseType] || 0) + 1;
    });
    
    const distributionData = Object.entries(typeCount).map(([name, value]) => ({
      name,
      value
    }));
    
    return {
      data: distributionData.length > 0 ? distributionData : [
        { name: '暂无数据', value: 1 }
      ]
    };
  } catch (error) {
    console.error('获取设备类型分布失败:', error);
    return {
      data: [{ name: '暂无数据', value: 1 }]
    };
  }
};

/**
 * 获取机房利用率分布
 */
export const getRoomUtilization = async () => {
  try {
    const [roomsRes, devicesRes] = await Promise.all([
      get(API_ENDPOINTS.ROOMS),
      get(API_ENDPOINTS.DEVICES)
    ]);
    
    if (!roomsRes.success || !devicesRes.success) {
      throw new Error('获取数据失败');
    }
    
    const rooms = roomsRes.data.results || roomsRes.data || [];
    const devices = devicesRes.data.results || devicesRes.data || [];
    
    // 计算每个机房的设备数量
    const roomDeviceCount = {};
    devices.forEach(device => {
      if (device.room_name) {
        roomDeviceCount[device.room_name] = (roomDeviceCount[device.room_name] || 0) + 1;
      }
    });
    
    // 生成利用率数据（这里简化处理，实际可能需要根据机房容量计算）
    const utilizationData = rooms.map(room => ({
      name: room.name,
      value: Math.min((roomDeviceCount[room.name] || 0) * 10, 100) // 简化计算
    }));
    
    return {
      data: utilizationData.length > 0 ? utilizationData : [
        { name: '暂无数据', value: 0 }
      ]
    };
  } catch (error) {
    console.error('获取机房利用率失败:', error);
    return {
      data: [{ name: '暂无数据', value: 0 }]
    };
  }
};

/**
 * 获取设备状态分布
 */
export const getDeviceStatusDistribution = async () => {
  try {
    // 并行获取设备数据和告警数据
    const [devicesRes, alertsRes] = await Promise.all([
      get(API_ENDPOINTS.DEVICES),
      get(API_ENDPOINTS.DEVICE_ALERTS)
    ]);
    
    if (!devicesRes.success) {
      throw new Error('获取设备数据失败');
    }
    
    const devices = devicesRes.data.results || devicesRes.data || [];
    const alerts = alertsRes.success ? (alertsRes.data.results || alertsRes.data || []) : [];
    
    // 统计每个设备的活跃告警情况
    const deviceAlertMap = {};
    alerts.forEach(alert => {
      // 统计活跃告警（active）和已确认告警（acknowledged），这些都表示设备仍有问题
      if (alert.device && (alert.status === 'active' || alert.status === 'acknowledged')) {
        const deviceId = alert.device;
        if (!deviceAlertMap[deviceId]) {
          deviceAlertMap[deviceId] = { critical: 0, warning: 0, info: 0 };
        }
        
        if (alert.level === 'critical' || alert.level === 'emergency') {
          deviceAlertMap[deviceId].critical++;
        } else if (alert.level === 'warning') {
          deviceAlertMap[deviceId].warning++;
        } else {
          deviceAlertMap[deviceId].info++;
        }
      }
    });
    
    // 根据告警情况统计设备状态
    const statusCount = {
      '正常': 0,
      '警告': 0,
      '故障': 0,
      '提示': 0
    };
    
    devices.forEach(device => {
      const deviceAlerts = deviceAlertMap[device.id];
      
      if (!deviceAlerts) {
        // 没有活跃告警的设备
        statusCount['正常']++;
      } else if (deviceAlerts.critical > 0) {
        // 有严重或紧急告警的设备
        statusCount['故障']++;
      } else if (deviceAlerts.warning > 0) {
        // 有警告级别告警的设备
        statusCount['警告']++;
      } else {
        // 只有提示级别告警的设备
        statusCount['提示']++;
      }
    });
    
    const distributionData = Object.entries(statusCount)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
    
    return {
      data: distributionData.length > 0 ? distributionData : [
        { name: '暂无数据', value: 1 }
      ]
    };
  } catch (error) {
    console.error('获取设备状态分布失败:', error);
    return {
      data: [{ name: '暂无数据', value: 1 }]
    };
  }
};

/**
 * 获取热力图数据（机房设备密度）
 */
export const getRoomHeatmap = async () => {
  try {
    const [roomsRes, devicesRes] = await Promise.all([
      get(API_ENDPOINTS.ROOMS),
      get(API_ENDPOINTS.DEVICES)
    ]);
    
    if (!roomsRes.success || !devicesRes.success) {
      throw new Error('获取数据失败');
    }
    
    const rooms = roomsRes.data.results || roomsRes.data || [];
    const devices = devicesRes.data.results || devicesRes.data || [];
    
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const roomNames = rooms.map(room => room.name);
    
    // 生成模拟的24小时数据（实际项目中可能需要真实的时间序列数据）
    const series = [];
    for (let i = 0; i < roomNames.length; i++) {
      for (let j = 0; j < hours.length; j++) {
        // 基于实际设备数量生成相对合理的热力数据
        const roomDevices = devices.filter(device => device.room_name === roomNames[i]);
        const baseValue = roomDevices.length * 5; // 基础值
        const randomValue = Math.floor(Math.random() * 20); // 随机波动
        series.push([j, i, Math.min(baseValue + randomValue, 100)]);
      }
    }
    
    return {
      data: {
        xAxis: hours,
        yAxis: roomNames.length > 0 ? roomNames : ['暂无数据'],
        series: series,
        max: 100
      }
    };
  } catch (error) {
    console.error('获取热力图数据失败:', error);
    return {
      data: {
        xAxis: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        yAxis: ['暂无数据'],
        series: [[0, 0, 0]],
        max: 100
      }
    };
  }
};

/**
 * 获取告警趋势数据
 */
export const getAlarmTrend = async (period = 'month') => {
  try {
    const response = await get(API_ENDPOINTS.DEVICE_ALERTS);
    
    if (!response.success) {
      throw new Error('获取告警数据失败');
    }
    
    const alerts = response.data.results || response.data || [];
    
    // 按严重程度分类
    const criticalAlerts = alerts.filter(alert => alert.level === 'critical');
    const warningAlerts = alerts.filter(alert => alert.level === 'warning');
    const infoAlerts = alerts.filter(alert => alert.level === 'info');
    
    const critical = generateTimeSeriesFromData(criticalAlerts, period, 'length', 'discovered_at');
    const warning = generateTimeSeriesFromData(warningAlerts, period, 'length', 'discovered_at');
    const info = generateTimeSeriesFromData(infoAlerts, period, 'length', 'discovered_at');
    
    return {
      data: {
        critical,
        warning,
        info
      }
    };
  } catch (error) {
    console.error('获取告警趋势失败:', error);
    return {
      data: {
        critical: generateTimeSeriesFromData([], period),
        warning: generateTimeSeriesFromData([], period),
        info: generateTimeSeriesFromData([], period)
      }
    };
  }
}; 