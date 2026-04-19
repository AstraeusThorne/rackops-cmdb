import dayjs from 'dayjs';

/**
 * 日期格式化函数
 * @param {string} date 日期字符串
 * @param {string} format 格式模板，默认YYYY-MM-DD
 * @returns {string} 格式化后的日期字符串
 */
export const formatDate = (date, format = 'YYYY-MM-DD') => {
  if (!date) return '-';
  return dayjs(date).format(format);
};

/**
 * 时间格式化函数
 * @param {string} time 时间字符串
 * @param {string} format 格式模板，默认HH:mm
 * @returns {string} 格式化后的时间字符串
 */
export const formatTime = (time, format = 'HH:mm') => {
  if (!time) return '-';
  return dayjs(`2000-01-01 ${time}`).format(format);
};

/**
 * 列表转字符串
 * @param {Array} list 列表数据
 * @param {string} key 取值的属性名
 * @param {string} separator 分隔符
 * @returns {string} 格式化后的字符串
 */
export const formatList = (list, key = 'name', separator = ', ') => {
  if (!list || !Array.isArray(list) || list.length === 0) return '-';
  return list.map(item => item[key]).join(separator);
};

/**
 * 格式化工具函数集合
 * 提取到工具文件中，避免每次渲染都重新创建函数
 */

/**
 * 格式化电源瓦数显示
 * @param {number} wattage - 瓦数
 * @returns {string} 格式化后的字符串
 */
export const formatPowerWattage = (wattage) => {
  if (!wattage || wattage === 0) return '-';
  if (wattage >= 1000) {
    return `${(wattage / 1000).toFixed(1)}kW`;
  }
  return `${wattage}W`;
};

/**
 * 格式化日期时间显示
 * @param {string|Date} dateTime - 日期时间
 * @returns {string} 格式化后的日期时间字符串
 */
export const formatDateTime = (dateTime) => {
  if (!dateTime) return '-';
  const date = new Date(dateTime);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的文件大小
 */
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

/**
 * 截断文本显示
 * @param {string} text - 原始文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的文本
 */
export const truncateText = (text, maxLength = 50) => {
  if (!text || text.length <= maxLength) return text || '-';
  return `${text.slice(0, maxLength)}...`;
};

/**
 * 格式化状态显示
 * @param {boolean} status - 状态值
 * @param {Object} options - 显示选项
 * @returns {Object} 格式化后的状态对象
 */
export const formatStatus = (status, options = {}) => {
  const defaultOptions = {
    trueText: '是',
    falseText: '否',
    trueColor: 'success',
    falseColor: 'default'
  };
  
  const opts = { ...defaultOptions, ...options };
  
  return {
    text: status ? opts.trueText : opts.falseText,
    color: status ? opts.trueColor : opts.falseColor
  };
}; 