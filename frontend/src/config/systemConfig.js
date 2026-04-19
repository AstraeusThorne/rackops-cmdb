/**
 * 系统配置模块
 * 定义默认配置值和配置管理函数
 */

/**
 * 默认告警阈值配置
 */
export const defaultAlertThresholds = {
  current: {
    warning: 10,  // 电流告警阈值（2路总电流，单位：A）
    critical: 20  // 电流严重告警阈值（2路总电流，单位：A）
  },
  voltage: {
    min: 200,     // 最低电压（单位：V）
    max: 250,     // 最高电压（单位：V）
    warning: {
      min: 210,   // 警告最低电压（单位：V）
      max: 240    // 警告最高电压（单位：V）
    }
  },
  power: {
    warning: 3500,   // 功率告警阈值（单位：W）
    critical: 4500  // 功率严重告警阈值（单位：W）
  },
  powerFactor: {
    min: 0.8  // 最低功率因数
  }
};

/**
 * 默认显示配置
 */
export const defaultDisplaySettings = {
  currentProgressMax: 32,  // 电流进度条最大值（单位：A）
  chartHeight: {
    default: 200,  // 默认图表高度（单位：px）
    detail: 300    // 详情图表高度（单位：px）
  },
  historyDataDays: 1,  // 历史数据查询天数（默认查询前一天）
  chartXAxisInterval: 4,  // 图表X轴标签间隔（单位：小时）
  voltageNominal: 220,  // 电压基准值（单位：V）
  loadRateThreshold: 0.8  // 负载率告警阈值（80%）
};

/**
 * 完整默认配置
 */
export const defaultConfig = {
  alertThresholds: defaultAlertThresholds,
  displaySettings: defaultDisplaySettings
};

/**
 * 从localStorage获取配置
 * @returns {Object|null} 配置对象或null
 */
export const getConfigFromStorage = () => {
  try {
    const stored = localStorage.getItem('systemConfig');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('读取配置缓存失败:', error);
  }
  return null;
};

/**
 * 保存配置到localStorage
 * @param {Object} config - 配置对象
 */
export const saveConfigToStorage = (config) => {
  try {
    localStorage.setItem('systemConfig', JSON.stringify(config));
    localStorage.setItem('systemConfigTimestamp', Date.now().toString());
  } catch (error) {
    console.error('保存配置缓存失败:', error);
  }
};

/**
 * 合并配置（API配置优先，然后是缓存，最后是默认值）
 * @param {Object} apiConfig - 从API获取的配置
 * @param {Object|null} cachedConfig - 缓存的配置
 * @returns {Object} 合并后的配置
 */
export const mergeConfig = (apiConfig = {}, cachedConfig = null) => {
  // 确保 cachedConfig 是对象而不是 null 或 undefined
  const safeCachedConfig = cachedConfig && typeof cachedConfig === 'object' ? cachedConfig : {};
  const safeApiConfig = apiConfig && typeof apiConfig === 'object' ? apiConfig : {};

  const merged = {
    alertThresholds: {
      ...defaultAlertThresholds,
      ...(safeCachedConfig.alertThresholds || {}),
      ...(safeApiConfig.alertThresholds || {})
    },
    displaySettings: {
      ...defaultDisplaySettings,
      ...(safeCachedConfig.displaySettings || {}),
      ...(safeApiConfig.displaySettings || {})
    }
  };

  // 深度合并嵌套对象
  if (safeApiConfig.alertThresholds?.voltage || safeCachedConfig.alertThresholds?.voltage) {
    merged.alertThresholds.voltage = {
      ...defaultAlertThresholds.voltage,
      ...(safeCachedConfig.alertThresholds?.voltage || {}),
      ...(safeApiConfig.alertThresholds?.voltage || {}),
      warning: {
        ...defaultAlertThresholds.voltage.warning,
        ...(safeCachedConfig.alertThresholds?.voltage?.warning || {}),
        ...(safeApiConfig.alertThresholds?.voltage?.warning || {})
      }
    };
  }

  if (safeApiConfig.displaySettings?.chartHeight || safeCachedConfig.displaySettings?.chartHeight) {
    merged.displaySettings.chartHeight = {
      ...defaultDisplaySettings.chartHeight,
      ...(safeCachedConfig.displaySettings?.chartHeight || {}),
      ...(safeApiConfig.displaySettings?.chartHeight || {})
    };
  }

  return merged;
};

/**
 * 获取配置值（支持路径访问，如 'alertThresholds.current.warning'）
 * @param {Object} config - 配置对象
 * @param {string} path - 配置路径
 * @param {*} defaultValue - 默认值
 * @returns {*} 配置值
 */
export const getConfigValue = (config, path, defaultValue = null) => {
  if (!config || !path) return defaultValue;
  
  const keys = path.split('.');
  let value = config;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return defaultValue;
    }
  }
  
  return value !== undefined ? value : defaultValue;
};

const systemConfig = {
  defaultConfig,
  defaultAlertThresholds,
  defaultDisplaySettings,
  getConfigFromStorage,
  saveConfigToStorage,
  mergeConfig,
  getConfigValue
};

export default systemConfig;
