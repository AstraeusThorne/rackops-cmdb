/**
 * 验证电子邮件格式
 * @param {string} email 电子邮件
 * @returns {boolean} 是否有效
 */
export const isValidEmail = (email) => {
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email);
};

/**
 * 验证手机号
 * @param {string} phone 手机号
 * @returns {boolean} 是否有效
 */
export const isValidPhone = (phone) => {
  const regex = /^1[3-9]\d{9}$/;
  return regex.test(phone);
};

/**
 * 验证身份证号
 * @param {string} idCard 身份证号
 * @returns {boolean} 是否有效
 */
export const isValidIdCard = (idCard) => {
  const regex = /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/;
  return regex.test(idCard);
};

/**
 * 验证IP地址
 * @param {string} ip IP地址
 * @returns {boolean} 是否有效
 */
export const isValidIP = (ip) => {
  const regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return regex.test(ip);
};

/**
 * 验证URL
 * @param {string} url URL地址
 * @returns {boolean} 是否有效
 */
export const isValidURL = (url) => {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}; 