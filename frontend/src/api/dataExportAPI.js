/**
 * 数据导出 API：事件汇总、人员进出、上架汇总、下架汇总
 */

import { buildApiUrl, getAuthHeaders } from './config';

/**
 * 触发浏览器下载 Excel 文件
 * @param {Blob} blob - 文件内容
 * @param {string} filename - 文件名
 */
const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

/**
 * 构建带查询参数的导出 URL
 */
const buildExportUrl = (path, params = {}) => {
  const search = new URLSearchParams();
  if (params.date_from) search.append('date_from', params.date_from);
  if (params.date_to) search.append('date_to', params.date_to);
  const query = search.toString();
  return buildApiUrl(`/data-export/${path}/`) + (query ? `?${query}` : '');
};

const dataExportAPI = {
  /**
   * 导出一个 Excel 文件（含 4 个 Sheet：事件汇总、人员进出、上架汇总、下架汇总）
   * @param {Object} [params] - { date_from, date_to } YYYY-MM-DD
   */
  exportAll: async (params = {}) => {
    const url = buildExportUrl('all', params);
    const response = await fetch(url, { method: 'GET', headers: getAuthHeaders() });
    if (!response.ok) throw new Error(response.statusText || '导出失败');
    const blob = await response.blob();
    const name = response.headers.get('Content-Disposition')?.match(/filename="?(.+)"?/)?.[1] || '数据导出_事件与设备汇总.xlsx';
    downloadBlob(blob, decodeURIComponent(name));
    return { success: true };
  },

  /**
   * 导出事件汇总 Excel
   * @param {Object} [params] - { date_from, date_to } YYYY-MM-DD
   */
  exportEvents: async (params = {}) => {
    const url = buildExportUrl('events', params);
    const response = await fetch(url, { method: 'GET', headers: getAuthHeaders() });
    if (!response.ok) throw new Error(response.statusText || '导出失败');
    const blob = await response.blob();
    const name = response.headers.get('Content-Disposition')?.match(/filename="?(.+)"?/)?.[1] || '事件汇总.xlsx';
    downloadBlob(blob, decodeURIComponent(name));
    return { success: true };
  },

  /**
   * 导出人员进出 Excel
   */
  exportPersonnel: async (params = {}) => {
    const url = buildExportUrl('personnel', params);
    const response = await fetch(url, { method: 'GET', headers: getAuthHeaders() });
    if (!response.ok) throw new Error(response.statusText || '导出失败');
    const blob = await response.blob();
    const name = response.headers.get('Content-Disposition')?.match(/filename="?(.+)"?/)?.[1] || '人员进出.xlsx';
    downloadBlob(blob, decodeURIComponent(name));
    return { success: true };
  },

  /**
   * 导出上架汇总 Excel
   */
  exportInstall: async (params = {}) => {
    const url = buildExportUrl('install', params);
    const response = await fetch(url, { method: 'GET', headers: getAuthHeaders() });
    if (!response.ok) throw new Error(response.statusText || '导出失败');
    const blob = await response.blob();
    const name = response.headers.get('Content-Disposition')?.match(/filename="?(.+)"?/)?.[1] || '上架汇总.xlsx';
    downloadBlob(blob, decodeURIComponent(name));
    return { success: true };
  },

  /**
   * 导出下架汇总 Excel
   */
  exportDecommission: async (params = {}) => {
    const url = buildExportUrl('decommission', params);
    const response = await fetch(url, { method: 'GET', headers: getAuthHeaders() });
    if (!response.ok) throw new Error(response.statusText || '导出失败');
    const blob = await response.blob();
    const name = response.headers.get('Content-Disposition')?.match(/filename="?(.+)"?/)?.[1] || '下架汇总.xlsx';
    downloadBlob(blob, decodeURIComponent(name));
    return { success: true };
  },
};

export default dataExportAPI;
