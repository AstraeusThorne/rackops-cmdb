/**
 * Excel运维故事导入API服务
 * 提供文件上传、预览、导入、回滚等功能
 */

import { buildApiUrl, getAuthHeaders, handleApiError } from './config';

/**
 * 运维故事导入API服务
 */
const operationStoryImportAPI = {
  /**
   * 上传文件并预览
   * @param {File} file - Excel文件
   * @param {Object} options - 导入选项
   * @param {boolean} options.preview - 是否预览模式
   * @param {string} options.personnel_sheet - 人员进出表Sheet名称
   * @param {string} options.device_sheet - 设备上下架表Sheet名称
   * @param {string} options.batch_id - 批次ID
   * @returns {Promise} 预览结果Promise
   */
  uploadFile: async (file, options = {}) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('options', JSON.stringify({
        preview: true,
        personnel_sheet: options.personnel_sheet || '人员进出',
        install_sheet: options.install_sheet || '上架汇总',
        decommission_sheet: options.decommission_sheet || '下架汇总',
        batch_id: options.batch_id || `BATCH_${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}`,
      }));

      const url = buildApiUrl('/operation-story-import/upload/');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
        },
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        return { success: true, data };
      }
      const errorMsg = data.error || data.message || data.detail || response.statusText || '上传失败';
      return { success: false, error: errorMsg, errorType: data.error_type };
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * 执行导入
   * @param {File} file - Excel文件
   * @param {Object} options - 导入选项
   * @param {boolean} options.incremental - 是否增量导入
   * @param {string} options.personnel_sheet - 人员进出表Sheet名称
   * @param {string} options.device_sheet - 设备上下架表Sheet名称
   * @param {string} options.batch_id - 批次ID
   * @param {number} options.max_rows - 最大处理行数（用于测试）
   * @returns {Promise} 导入结果Promise
   */
  importData: async (file, options = {}) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('options', JSON.stringify({
        incremental: options.incremental || false,
        personnel_sheet: options.personnel_sheet || '人员进出',
        install_sheet: options.install_sheet || '上架汇总',
        decommission_sheet: options.decommission_sheet || '下架汇总',
        batch_id: options.batch_id || `BATCH_${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}`,
        max_rows: options.max_rows || null,
      }));

      const url = buildApiUrl('/operation-story-import/import_data/');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
        },
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        return { success: true, data };
      }
      const errorMsg = data.error || data.message || data.detail || response.statusText || '导入失败';
      return { success: false, error: errorMsg, errorType: data.error_type };
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * 回滚导入
   * @param {string} batchId - 批次ID
   * @returns {Promise} 回滚结果Promise
   */
  rollbackImport: async (batchId) => {
    try {
      const url = buildApiUrl('/operation-story-import/rollback/');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        return { success: true, data };
      }
      return { success: false, error: data?.error || data?.detail || response.statusText || '回滚失败' };
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * 获取导入历史记录
   * @param {Object} params - 查询参数
   * @param {number} params.page - 页码（默认1）
   * @param {number} params.page_size - 每页数量（默认20）
   * @returns {Promise} 导入历史列表Promise
   */
  getImportHistory: async (params = {}) => {
    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page);
      if (params.page_size) queryParams.append('page_size', params.page_size);
      if (params.incremental !== undefined) queryParams.append('incremental', params.incremental);
      
      const url = buildApiUrl(`/operation-story-import/import_history/?${queryParams.toString()}`);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...getAuthHeaders(),
        },
      });

      const data = await response.json();
      if (response.ok) {
        return { success: true, data };
      } else {
        return { success: false, error: data.error || data.detail || '获取导入历史失败' };
      }
    } catch (error) {
      return handleApiError(error);
    }
  },

  /**
   * 下载Excel模板
   * @returns {Promise} 下载结果Promise
   */
  downloadTemplate: async () => {
    try {
      const url = buildApiUrl('/operation-story-import/download_template/');
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '下载失败');
      }

      // 获取文件名
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = '运维故事导入模板.xlsx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1]);
        }
      }

      // 创建Blob并下载
      const blob = await response.blob();
      const url_blob = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url_blob;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url_blob);

      return { success: true, message: '模板下载成功' };
    } catch (error) {
      return { success: false, error: error.message || '下载失败' };
    }
  }
};

export default operationStoryImportAPI;
