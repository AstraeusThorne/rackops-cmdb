/**
 * 弱电监控静态数据
 * 包含机柜AB路电流、电量、电压等信息
 */

// 生成随机数据的工具函数
const generateRandomValue = (min, max, decimals = 2) => {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
};

// 生成时间序列数据
const generateTimeSeriesData = (hours = 24, interval = 1) => {
  const data = [];
  const now = new Date();
  
  for (let i = hours; i >= 0; i -= interval) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    data.push({
      time: time.toISOString(),
      timestamp: time.getTime()
    });
  }
  
  return data;
};

// 机房信息
export const roomsData = [
  {
    roomId: 'F1B',
    roomName: 'F1B机房',
    location: '一楼B区',
    capacity: 180,
    description: '主要数据中心机房',
    status: 'active'
  },
  {
    roomId: 'F1D',
    roomName: 'F1D机房',
    location: '一楼D区',
    capacity: 150,
    description: '备用数据中心机房',
    status: 'active'
  }
];

// 生成机柜数据的函数
const generateCabinetData = (roomId, roomName, cabinetCount) => {
  const cabinets = [];
  const areas = ['A', 'B', 'C', 'D', 'E', 'F'];
  const statusOptions = ['normal', 'warning', 'critical', 'offline'];
  const statusWeights = [0.7, 0.2, 0.08, 0.02]; // 正常70%, 警告20%, 严重8%, 离线2%
  
  for (let i = 1; i <= cabinetCount; i++) {
    const areaIndex = Math.floor((i - 1) / 30); // 每30个机柜一个区域
    const area = areas[areaIndex] || 'A';
    const rowNum = Math.floor(((i - 1) % 30) / 6) + 1; // 每6个机柜一排
    const colNum = ((i - 1) % 6) + 1;
    
    // 根据权重随机选择状态
    const rand = Math.random();
    let status = 'normal';
    let cumWeight = 0;
    for (let j = 0; j < statusOptions.length; j++) {
      cumWeight += statusWeights[j];
      if (rand <= cumWeight) {
        status = statusOptions[j];
        break;
      }
    }
    
    // 根据状态调整数据范围
    let voltageRange, currentRange, powerRange, tempRange;
    switch (status) {
      case 'critical':
        voltageRange = [200, 220];
        currentRange = [18, 25];
        powerRange = [4000, 5500];
        tempRange = [35, 45];
        break;
      case 'warning':
        voltageRange = [210, 235];
        currentRange = [12, 18];
        powerRange = [2800, 4200];
        tempRange = [30, 40];
        break;
      case 'offline':
        voltageRange = [0, 0];
        currentRange = [0, 0];
        powerRange = [0, 0];
        tempRange = [20, 25];
        break;
      default: // normal
        voltageRange = [220, 240];
        currentRange = [6, 15];
        powerRange = [1400, 3600];
        tempRange = [22, 35];
    }
    
    const cabinet = {
      cabinetId: `${roomId}-${area}${String(i).padStart(2, '0')}`,
      cabinetName: `机柜${area}${String(colNum).padStart(2, '0')}`,
      room: roomId,
      roomName: roomName,
      location: `${area}区第${rowNum}排`,
      area: area,
      row: rowNum,
      column: colNum,
      status: status,
      lastUpdate: status === 'offline' 
        ? new Date(Date.now() - Math.random() * 4 * 60 * 60 * 1000).toISOString() // 0-4小时前
        : new Date().toISOString(),
      
      // A路电源数据
      circuitA: {
        voltage: status === 'offline' ? 0 : generateRandomValue(voltageRange[0], voltageRange[1], 1),
        current: status === 'offline' ? 0 : generateRandomValue(currentRange[0], currentRange[1], 2),
        power: status === 'offline' ? 0 : generateRandomValue(powerRange[0], powerRange[1], 0),
        powerFactor: status === 'offline' ? 0 : generateRandomValue(0.75, 0.98, 2),
        frequency: status === 'offline' ? 0 : generateRandomValue(49.5, 50.5, 1),
        energy: generateRandomValue(800, 4200, 1),
        temperature: generateRandomValue(tempRange[0], tempRange[1], 1),
        status: status === 'critical' ? 'critical' : (status === 'warning' && Math.random() > 0.5 ? 'warning' : (status === 'offline' ? 'offline' : 'normal'))
      },
      
      // B路电源数据
      circuitB: {
        voltage: status === 'offline' ? 0 : generateRandomValue(voltageRange[0], voltageRange[1], 1),
        current: status === 'offline' ? 0 : generateRandomValue(currentRange[0], currentRange[1], 2),
        power: status === 'offline' ? 0 : generateRandomValue(powerRange[0], powerRange[1], 0),
        powerFactor: status === 'offline' ? 0 : generateRandomValue(0.75, 0.98, 2),
        frequency: status === 'offline' ? 0 : generateRandomValue(49.5, 50.5, 1),
        energy: generateRandomValue(750, 4100, 1),
        temperature: generateRandomValue(tempRange[0], tempRange[1], 1),
        status: status === 'offline' ? 'offline' : 'normal'
      },
      
      // 总计数据
      total: {
        power: 0, // 将在后面计算
        current: 0,
        energy: 0
      }
    };
    
    cabinets.push(cabinet);
  }
  
  return cabinets;
};

// 生成所有机柜数据
const f1bCabinets = generateCabinetData('F1B', 'F1B机房', 180);
const f1dCabinets = generateCabinetData('F1D', 'F1D机房', 150);

// 合并所有机柜数据
export const cabinetPowerData = [...f1bCabinets, ...f1dCabinets];

// 计算总计数据
cabinetPowerData.forEach(cabinet => {
  cabinet.total.power = cabinet.circuitA.power + cabinet.circuitB.power;
  cabinet.total.current = cabinet.circuitA.current + cabinet.circuitB.current;
  cabinet.total.energy = cabinet.circuitA.energy + cabinet.circuitB.energy;
});

// 历史趋势数据
export const powerTrendData = cabinetPowerData.map(cabinet => {
  const timePoints = generateTimeSeriesData(24, 1); // 24小时，每小时一个点
  
  return {
    cabinetId: cabinet.cabinetId,
    cabinetName: cabinet.cabinetName,
    trends: {
      power: timePoints.map(point => ({
        ...point,
        circuitA: generateRandomValue(cabinet.circuitA.power * 0.8, cabinet.circuitA.power * 1.2, 0),
        circuitB: generateRandomValue(cabinet.circuitB.power * 0.8, cabinet.circuitB.power * 1.2, 0),
        total: 0 // 将在后面计算
      })),
      
      current: timePoints.map(point => ({
        ...point,
        circuitA: generateRandomValue(cabinet.circuitA.current * 0.8, cabinet.circuitA.current * 1.2, 2),
        circuitB: generateRandomValue(cabinet.circuitB.current * 0.8, cabinet.circuitB.current * 1.2, 2),
        total: 0
      })),
      
      voltage: timePoints.map(point => ({
        ...point,
        circuitA: generateRandomValue(cabinet.circuitA.voltage * 0.95, cabinet.circuitA.voltage * 1.05, 1),
        circuitB: generateRandomValue(cabinet.circuitB.voltage * 0.95, cabinet.circuitB.voltage * 1.05, 1)
      }))
    }
  };
});

// 计算趋势数据的总计
powerTrendData.forEach(cabinet => {
  cabinet.trends.power.forEach(point => {
    point.total = point.circuitA + point.circuitB;
  });
  
  cabinet.trends.current.forEach(point => {
    point.total = point.circuitA + point.circuitB;
  });
});

// 按机房统计数据
export const roomPowerStats = roomsData.map(room => {
  const roomCabinets = cabinetPowerData.filter(cabinet => cabinet.room === room.roomId);
  const activeCabinets = roomCabinets.filter(cabinet => cabinet.status !== 'offline');
  
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    totalCabinets: roomCabinets.length,
    activeCabinets: activeCabinets.length,
    offlineCabinets: roomCabinets.length - activeCabinets.length,
    normalCabinets: roomCabinets.filter(cabinet => cabinet.status === 'normal').length,
    warningCabinets: roomCabinets.filter(cabinet => cabinet.status === 'warning').length,
    criticalCabinets: roomCabinets.filter(cabinet => cabinet.status === 'critical').length,
    totalPower: activeCabinets.reduce((sum, cabinet) => sum + cabinet.total.power, 0),
    totalCurrent: activeCabinets.reduce((sum, cabinet) => sum + cabinet.total.current, 0),
    totalEnergy: roomCabinets.reduce((sum, cabinet) => sum + cabinet.total.energy, 0),
    averageVoltageA: activeCabinets.length > 0 
      ? activeCabinets.reduce((sum, cabinet) => sum + cabinet.circuitA.voltage, 0) / activeCabinets.length 
      : 0,
    averageVoltageB: activeCabinets.length > 0 
      ? activeCabinets.reduce((sum, cabinet) => sum + cabinet.circuitB.voltage, 0) / activeCabinets.length 
      : 0,
    maxTemperature: Math.max(
      ...roomCabinets.map(cabinet => Math.max(cabinet.circuitA.temperature, cabinet.circuitB.temperature))
    ),
    lastUpdate: new Date().toISOString()
  };
});

// 全局统计数据
export const globalPowerStats = {
  totalRooms: roomsData.length,
  totalCabinets: cabinetPowerData.length,
  activeCabinets: cabinetPowerData.filter(cabinet => cabinet.status !== 'offline').length,
  offlineCabinets: cabinetPowerData.filter(cabinet => cabinet.status === 'offline').length,
  normalCabinets: cabinetPowerData.filter(cabinet => cabinet.status === 'normal').length,
  warningCabinets: cabinetPowerData.filter(cabinet => cabinet.status === 'warning').length,
  criticalCabinets: cabinetPowerData.filter(cabinet => cabinet.status === 'critical').length,
  totalPower: cabinetPowerData.reduce((sum, cabinet) => sum + cabinet.total.power, 0),
  totalCurrent: cabinetPowerData.reduce((sum, cabinet) => sum + cabinet.total.current, 0),
  totalEnergy: cabinetPowerData.reduce((sum, cabinet) => sum + cabinet.total.energy, 0),
  lastUpdate: new Date().toISOString()
};

/**
 * @deprecated 此配置已废弃，请使用 ConfigContext 获取配置
 * 告警阈值配置（保留用于向后兼容）
 */
export const alertThresholds = {
  voltage: {
    min: 200, // 最低电压
    max: 250, // 最高电压
    warning: { min: 210, max: 240 }
  },
  current: {
    warning: 10, // 电流告警阈值（2路总电流）
    critical: 20 // 电流严重告警阈值（2路总电流）
  },
  power: {
    warning: 3500, // 功率告警阈值
    critical: 4500 // 功率严重告警阈值
  },
  // 注意：温度告警阈值已移除，不再使用
  powerFactor: {
    min: 0.8 // 最低功率因数
  }
};

/**
 * @deprecated 此配置已废弃，请使用 ConfigContext 获取配置
 * 显示配置（新增）
 */
export const displaySettings = {
  currentProgressMax: 32,  // 电流进度条最大值
  chartHeight: {
    default: 200,
    detail: 300
  },
  historyDataDays: 1,  // 历史数据查询天数
  chartXAxisInterval: 4,  // 图表X轴标签间隔（小时）
  voltageNominal: 220,  // 电压基准值
  loadRateThreshold: 0.8  // 负载率告警阈值
};

// 状态颜色映射
export const statusColors = {
  normal: '#52c41a',
  warning: '#faad14',
  critical: '#f5222d',
  offline: '#8c8c8c'
};

// 导出所有数据
export default {
  roomsData,
  cabinetPowerData,
  powerTrendData,
  roomPowerStats,
  globalPowerStats,
  alertThresholds,
  displaySettings,
  statusColors
};