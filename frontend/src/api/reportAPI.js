/**
 * 报表 API
 * 封装报表生成与导出接口
 */

import request from './axios';

/**
 * 报表 API 服务
 */
const reportAPI = {
  /**
   * 生成报表
   * @param {Object} params - 报表参数
   * @param {string} params.period_type - 报表类型（daily/weekly/monthly/yearly/cabinet/power_monthly）
   * @param {string} params.start_date - 开始日期 YYYY-MM-DD
   * @param {string} params.end_date - 结束日期 YYYY-MM-DD
   * @param {string} params.format - 格式 json/excel/pdf
   * @param {number} [params.client_id] - 客户ID（可选）
   * @param {number} [params.cabinet_id] - 机柜ID（可选）
   * @param {number[]} [params.cabinet_ids] - 多机柜ID列表（机柜视图导出用）
   * @returns {Promise} 报表数据（format=json）或 blob 响应（format=excel/pdf）
   */
  generateReport: (params) => {
    if (params.format === 'excel' || params.format === 'pdf') {
      return request({
        url: '/reports/generate/',
        method: 'POST',
        data: params,
        responseType: 'blob',
        timeout: 60000,
      });
    }
    return request.post('/reports/generate/', params);
  },
};

export default reportAPI;
export { reportAPI };
