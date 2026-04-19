/**
 * 文件下载工具
 * 处理 Blob 响应并触发浏览器下载
 */

/**
 * 从 Blob 触发文件下载
 * @param {Blob} blob - 文件 Blob
 * @param {string} filename - 下载文件名
 */
export const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};
