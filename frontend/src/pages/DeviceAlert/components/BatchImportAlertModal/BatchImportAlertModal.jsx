import React, { useState } from 'react';
import { Modal, Upload, Button, message, Alert, List } from 'antd';
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons';
import * as deviceAlertAPI from '../../../../api/deviceAlertAPI';

const { Dragger } = Upload;

/**
 * 设备告警批量导入弹窗
 * @param {Object} props - 组件属性
 * @param {boolean} props.visible - 是否显示
 * @param {function} props.onCancel - 取消回调
 * @param {function} props.onSuccess - 导入成功回调（刷新列表）
 * @returns {React.ReactElement} 批量导入弹窗
 */
const BatchImportAlertModal = ({ visible, onCancel, onSuccess }) => {
  const [fileList, setFileList] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  /**
   * 下载 Excel 模板
   */
  const handleDownloadTemplate = async () => {
    try {
      const res = await deviceAlertAPI.downloadAlertImportTemplate();
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '设备告警导入模板.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('模板已下载');
    } catch (err) {
      message.error('下载模板失败');
      console.error(err);
    }
  };

  /**
   * 执行批量导入
   */
  const handleImport = async () => {
    if (fileList.length === 0) {
      message.warning('请先选择要导入的 Excel 文件');
      return;
    }
    const file = fileList[0].originFileObj || fileList[0];
    if (!file) {
      message.warning('文件无效');
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const res = await deviceAlertAPI.batchImportAlerts(file);
      const data = res.data || res;
      setResult({
        created: data.created ?? 0,
        failed: data.failed ?? 0,
        errors: data.errors ?? [],
      });
      if (data.created > 0) {
        message.success(`成功导入 ${data.created} 条告警`);
        if (typeof onSuccess === 'function') onSuccess();
      }
      if (data.failed > 0 && data.created === 0) {
        message.warning(`有 ${data.failed} 条导入失败，请查看下方错误详情`);
      }
    } catch (err) {
      const detail = err.response?.data?.error || err.response?.data?.detail || err.message || '导入失败';
      message.error(typeof detail === 'string' ? detail : '导入失败');
      setResult({ created: 0, failed: 0, errors: [{ row: '-', message: String(detail) }] });
    } finally {
      setUploading(false);
    }
  };

  /**
   * 关闭弹窗时重置状态
   */
  const handleClose = () => {
    setFileList([]);
    setResult(null);
    onCancel?.();
  };

  const uploadProps = {
    name: 'file',
    multiple: false,
    accept: '.xlsx,.xls',
    fileList,
    beforeUpload: (file) => {
      setFileList([{ uid: file.uid, name: file.name, status: 'done', originFileObj: file }]);
      return false; // 阻止自动上传
    },
    onRemove: () => setFileList([]),
  };

  return (
    <Modal
      title="批量导入告警"
      open={visible}
      onCancel={handleClose}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          关闭
        </Button>,
        <Button
          key="import"
          type="primary"
          loading={uploading}
          disabled={fileList.length === 0}
          onClick={handleImport}
        >
          开始导入
        </Button>,
      ]}
      width={560}
      destroyOnClose
    >
      <Alert
        message="导入说明"
        description={
          <>
            <p>请使用 Excel 文件，表头需包含：<strong>告警标题</strong>、<strong>告警描述</strong>、<strong>告警级别</strong>（可填中文：提示/警告/严重/紧急 或英文）、<strong>状态</strong>（可选）、<strong>发现时间</strong>（可选，如 2025-02-21 10:00:00）、<strong>值班人员</strong>（可选，填姓名）、<strong>设备SN</strong>（可选，须在设备表中存在，否则该行导入失败）。</p>
            <Button type="link" icon={<DownloadOutlined />} onClick={handleDownloadTemplate} style={{ padding: 0 }}>
              下载导入模板
            </Button>
          </>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Dragger {...uploadProps}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined style={{ color: '#1890ff' }} />
        </p>
        <p className="ant-upload-text">点击或拖拽 Excel 文件到此区域</p>
        <p className="ant-upload-hint">仅支持 .xlsx、.xls 格式</p>
      </Dragger>
      {result && (
        <div style={{ marginTop: 16 }}>
          <Alert
            message={`导入完成：成功 ${result.created} 条，失败 ${result.failed} 条`}
            type={result.failed > 0 ? 'warning' : 'success'}
            showIcon
            style={{ marginBottom: 8 }}
          />
          {result.errors.length > 0 && (
            <List
              size="small"
              header="失败详情（最多显示 50 条）"
              bordered
              dataSource={result.errors}
              renderItem={({ row, message: msg }) => (
                <List.Item>
                  第 {row} 行：{typeof msg === 'object' ? JSON.stringify(msg) : msg}
                </List.Item>
              )}
              style={{ maxHeight: 200, overflow: 'auto' }}
            />
          )}
        </div>
      )}
    </Modal>
  );
};

export default BatchImportAlertModal;
