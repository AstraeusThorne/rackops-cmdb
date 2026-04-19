/**
 * 仓库设备历史记录查看组件
 * 以时间线或表格形式展示历史记录
 * 
 * @param {Object} props - 组件属性
 * @param {number} props.warehouseDeviceId - 仓库设备ID
 * @returns {React.ReactElement} 历史记录查看组件
 */
import React, { useState, useEffect } from 'react';
import { Table, Timeline, Tabs, Tag, message } from 'antd';
import dayjs from 'dayjs';
import { warehouseDeviceAPI } from '../../api/warehouseDeviceAPI';

const WarehouseDeviceHistory = ({ warehouseDeviceId }) => {
  const [historyRecords, setHistoryRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (warehouseDeviceId) {
      fetchHistory();
    }
  }, [warehouseDeviceId]);

  /**
   * 获取历史记录
   */
  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await warehouseDeviceAPI.getWarehouseDeviceHistory({
        warehouse_device: warehouseDeviceId
      });
      setHistoryRecords(response.data.results || response.data || []);
    } catch (error) {
      message.error('获取历史记录失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 获取操作类型标签颜色
   * @param {string} action - 操作类型
   * @returns {string} 标签颜色
   */
  const getActionColor = (action) => {
    const colorMap = {
      'in': 'blue',
      'install': 'green',
      'out': 'orange',
      'update': 'purple'
    };
    return colorMap[action] || 'default';
  };

  /**
   * 获取操作类型显示文本
   * @param {string} action - 操作类型
   * @returns {string} 显示文本
   */
  const getActionText = (action) => {
    const textMap = {
      'in': '入库',
      'install': '上架',
      'out': '出库',
      'update': '更新'
    };
    return textMap[action] || action;
  };

  // 表格列定义
  const columns = [
    {
      title: '操作日期',
      dataIndex: 'action_date',
      key: 'action_date',
      render: (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    {
      title: '操作时间',
      dataIndex: 'action_time',
      key: 'action_time',
      render: (time) => time || '-'
    },
    {
      title: '操作类型',
      dataIndex: 'action',
      key: 'action',
      render: (action) => (
        <Tag color={getActionColor(action)}>
          {getActionText(action)}
        </Tag>
      )
    },
    {
      title: '上架位置',
      dataIndex: 'install_location',
      key: 'install_location',
      render: (location) => location || '-'
    },
    {
      title: '机架位置',
      dataIndex: 'install_rack_position',
      key: 'install_rack_position',
      render: (position) => position || '-'
    },
    {
      title: '机柜',
      dataIndex: 'cabinet_name',
      key: 'cabinet_name',
      render: (name) => name || '-'
    },
    {
      title: '操作人员',
      dataIndex: 'operator',
      key: 'operator',
      render: (operator) => operator || '-'
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      render: (notes) => notes || '-'
    }
  ];

  // 时间线数据
  const timelineItems = historyRecords.map((record, index) => {
    const dateTime = record.action_time 
      ? `${record.action_date} ${record.action_time}`
      : record.action_date;
    
    let description = `${getActionText(record.action)}`;
    
    if (record.action === 'install') {
      if (record.install_location) {
        description += ` - 位置: ${record.install_location}`;
      }
      if (record.install_rack_position) {
        description += ` (${record.install_rack_position})`;
      }
    }
    
    if (record.notes) {
      description += ` - ${record.notes}`;
    }

    return {
      color: getActionColor(record.action),
      children: (
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
            {dayjs(dateTime).format('YYYY-MM-DD HH:mm:ss')}
          </div>
          <div>{description}</div>
          {record.operator && (
            <div style={{ color: '#999', fontSize: '12px', marginTop: 4 }}>
              操作人员: {record.operator}
            </div>
          )}
        </div>
      )
    };
  });

  const tabItems = [
    {
      key: 'timeline',
      label: '时间线视图',
      children: <Timeline items={timelineItems} />
    },
    {
      key: 'table',
      label: '表格视图',
      children: (
        <Table
          columns={columns}
          dataSource={historyRecords}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
        />
      )
    }
  ];

  return (
    <Tabs defaultActiveKey="timeline" items={tabItems} />
  );
};

export default WarehouseDeviceHistory;

