import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Table, Space, Button, Tag, Modal, Tooltip } from 'antd';
import { 
  EditOutlined, 
  DeleteOutlined, 
  ExclamationCircleOutlined, 
  EyeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import EventDetails from '../EventDetails/EventDetails';
import styles from './EventTable.module.css';

/**
 * 事件表格组件（支持服务端分页）
 */
const EventTable = ({ events = [], loading = false, pagination, onPaginationChange, onEdit, onDelete }) => {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  // 查看事件详情
  const handleViewDetails = useCallback((record) => {
    setSelectedEvent(record);
    setDetailsVisible(true);
  }, []);

  // 关闭详情模态框
  const handleCloseDetails = useCallback(() => {
    setDetailsVisible(false);
    setSelectedEvent(null);
  }, []);

  // 确认删除
  const confirmDelete = useCallback((record) => {
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除事件 "${record.order_number}" 吗？`,
      okText: '确认',
      okType: 'danger',
      cancelText: '取消',
      onOk() {
        onDelete(record);
      }
    });
  }, [onDelete]);

  // 获取状态标签
  const getStatusTag = (record) => {
    // 首先检查completion_status字段（后端返回的完成状态）
    if (record.completion_status !== undefined) {
      return record.completion_status ? 
        <Tag color="green">已完成</Tag> : 
        <Tag color="orange">未完成</Tag>;
    }
    
    // 如果没有completion_status字段，则回退到使用status字段
    switch (record.status) {
      case 'pending':
        return <Tag color="orange">待处理</Tag>;
      case 'in_progress':
        return <Tag color="blue">处理中</Tag>;
      case 'completed':
        return <Tag color="green">已完成</Tag>;
      case 'canceled':
        return <Tag color="red">已取消</Tag>;
      default:
        return <Tag>未知</Tag>;
    }
  };

  // 表格列配置
  const columns = [
    {
      title: '订单号',
      dataIndex: 'order_number',
      key: 'order_number',
      width: 160,
      render: (text, record) => (
        <Button 
          type="link" 
          onClick={() => handleViewDetails(record)}
          style={{ padding: 0, height: 'auto' }}
        >
          {text}
        </Button>
      )
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 110,
      render: (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    {
      title: '时间',
      key: 'time',
      width: 200,
      render: (_, record) => {
        const startTime = record.start_time || '';
        const endTime = record.end_time || '';
        return startTime && endTime ? `${startTime} - ${endTime}` : '-';
      }
    },
    {
      title: '客户',
      dataIndex: 'clients',
      key: 'clients',
      width: 150,
      render: (clients) => {
        if (!Array.isArray(clients) || !clients.length) return '-';
        
        const displayClients = clients.slice(0, 2);
        const remainingCount = clients.length - 2;
        
        return (
          <div>
            {displayClients.map(client => client?.name).filter(Boolean).join(', ')}
            {remainingCount > 0 && (
              <Tooltip title={clients.slice(2).map(client => client?.name).filter(Boolean).join(', ')}>
                <span className={styles.moreText}>{` 等${remainingCount}个`}</span>
              </Tooltip>
            )}
          </div>
        );
      }
    },
    {
      title: '机房',
      dataIndex: 'rooms',
      key: 'rooms',
      width: 100,
      render: (rooms) => {
        if (!Array.isArray(rooms) || !rooms.length) return '-';
        return rooms.map(room => room?.name).filter(Boolean).join(', ');
      }
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, record) => getStatusTag(record)
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetails(record)}
            className={styles.actionButton}
            title="查看"
          />
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
            className={styles.actionButton}
            title="编辑"
          />
          <Button
            type="link"
            icon={<DeleteOutlined />}
            onClick={() => confirmDelete(record)}
            className={styles.actionButton}
            danger
            title="删除"
          />
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.tableContainer}>
      <Table
        rowKey="id"
        dataSource={events}
        columns={columns}
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => {
            onPaginationChange(prev => ({ ...prev, current: page, pageSize: pageSize || prev.pageSize }));
          },
          onShowSizeChange: (current, size) => {
            onPaginationChange(prev => ({ ...prev, current: 1, pageSize: size }));
          }
        }}
        className={styles.eventTable}
      />
      
      {selectedEvent && (
        <EventDetails
          visible={detailsVisible}
          event={selectedEvent}
          onClose={handleCloseDetails}
        />
      )}
    </div>
  );
};

EventTable.propTypes = {
  events: PropTypes.array.isRequired,
  loading: PropTypes.bool,
  pagination: PropTypes.shape({
    current: PropTypes.number,
    pageSize: PropTypes.number,
    total: PropTypes.number,
  }).isRequired,
  onPaginationChange: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired
};

export default EventTable; 