/**
 * 数据导出：一个 Excel 含 4 个 Sheet（事件汇总、人员进出、上架汇总、下架汇总）
 */

import React, { useState } from 'react';
import { Card, Form, DatePicker, Button, message, Alert } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dataExportAPI from '../../../../api/dataExportAPI';
import './DataExport.css';

const { RangePicker } = DatePicker;

const DataExport = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const getDateRange = () => {
    const v = form.getFieldValue('date_range');
    if (!v || !v[0] || !v[1]) return {};
    return {
      date_from: v[0].format('YYYY-MM-DD'),
      date_to: v[1].format('YYYY-MM-DD'),
    };
  };

  const handleExportAll = async () => {
    setLoading(true);
    try {
      await dataExportAPI.exportAll(getDateRange());
      message.success('导出成功，文件已下载（含 4 个 Sheet）');
    } catch (e) {
      message.error(e.message || '导出失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="data-export-container">
      <Card title="数据导出" className="export-card">
        <Alert
          message="导出一个 Excel 文件，包含 4 个 Sheet：事件汇总、人员进出、上架汇总、下架汇总。可按事件日期范围筛选，不选日期则导出全部数据。"
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
        <Form form={form} layout="inline" style={{ marginBottom: 24 }}>
          <Form.Item name="date_range" label="事件日期范围">
            <RangePicker allowEmpty={[true, true]} />
          </Form.Item>
        </Form>

        <Button
          type="primary"
          size="large"
          icon={<DownloadOutlined />}
          loading={loading}
          onClick={handleExportAll}
        >
          导出 Excel（事件汇总 / 人员进出 / 上架汇总 / 下架汇总）
        </Button>
      </Card>
    </div>
  );
};

export default DataExport;
