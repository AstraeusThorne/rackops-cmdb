import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Modal, Descriptions, Tabs, Table, Button } from 'antd';
import { FileTextOutlined, UserOutlined, DesktopOutlined, EditOutlined, HddOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { eventAPI } from '../../../../api';
import styles from './EventDetails.module.css';

/**
 * 事件详情组件
 * 显示完整的事件详细信息，包括订单号、日期时间、客户、机房、进场人员等。
 * 列表接口不包含 entry_personnel，打开详情时会按 id 请求完整事件数据以正确展示进场人员。
 */
const EventDetails = ({ visible, event, onClose }) => {
  const navigate = useNavigate();
  /** 完整事件详情（含 entry_personnel），由详情接口返回 */
  const [detailEvent, setDetailEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // 打开详情时按 id 请求完整事件（含进场人员），列表数据不包含 entry_personnel
  useEffect(() => {
    if (!visible || !event?.id) {
      setDetailEvent(null);
      setDetailError(null);
      return;
    }
    setLoading(true);
    setDetailError(null);
    eventAPI
      .getEvent(event.id)
      .then((res) => {
        setDetailEvent(res.data || null);
      })
      .catch((err) => {
        setDetailError(err?.response?.data?.detail || err?.message || '加载详情失败');
        setDetailEvent(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [visible, event?.id]);

  // 关闭弹窗时清空详情数据
  useEffect(() => {
    if (!visible) {
      setDetailEvent(null);
      setDetailError(null);
    }
  }, [visible]);

  /** 用于展示的事件数据：优先使用接口返回的完整详情，否则用列表传入的 event */
  const displayEvent = detailEvent != null ? detailEvent : event;
  const entryPersonnel = useMemo(() => displayEvent?.entry_personnel ?? [], [displayEvent]);

  // 编辑事件
  const handleEdit = () => {
    onClose();
    navigate(`/event/edit/${event.id}`);
  };

  // 进场人员表格列（后端 EntryPersonnel 字段：name, id_card, contact_info 等）
  const personnelColumns = useMemo(() => ([
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '身份证号',
      dataIndex: 'id_card',
      key: 'id_card',
      render: (text) => (text ? text.replace(/^(.{4})(.*)(.{4})$/, '$1****$3') : '-'),
    },
    {
      title: '电话',
      dataIndex: 'contact_info',
      key: 'contact_info',
      render: (text) => (text ? text.replace(/^(.{3})(.*)(.{4})$/, '$1****$3') : '-'),
    },
    {
      title: '所属单位',
      dataIndex: 'organization',
      key: 'organization',
    }
  ]), []);

  // 使用 useMemo 来稳定 Tabs items 数组，避免 key 警告
  const tabItems = useMemo(() => {
    const baseItems = [
      {
        key: 'basic',
        label: <><FileTextOutlined /> 基本信息</>,
        children: (
          <Descriptions bordered column={2} className={styles.descriptions}>
            <Descriptions.Item label="订单号" span={2}>{displayEvent?.order_number || '-'}</Descriptions.Item>
            <Descriptions.Item label="日期">{displayEvent?.date ? dayjs(displayEvent.date).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
            <Descriptions.Item label="时间">{`${displayEvent?.start_time || '-'} - ${displayEvent?.end_time || '-'}`}</Descriptions.Item>
            <Descriptions.Item label="事件描述" span={2}>{displayEvent?.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="客户" span={2}>
              {displayEvent?.clients?.map(client => client.name).join(', ') || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="授权单位" span={2}>
              {displayEvent?.authorized_orgs?.map(org => org.name).join(', ') || '-'}
            </Descriptions.Item>
          </Descriptions>
        )
      },
      {
        key: 'personnel',
        label: <><UserOutlined /> 进场人员 ({entryPersonnel.length})</>,
        children: (
          <Table
            dataSource={entryPersonnel}
            columns={personnelColumns}
            rowKey={(record) => record.id ?? `personnel-${record?.name ?? record?.contact_info ?? ''}`}
            loading={loading}
            pagination={entryPersonnel.length > 10 ? { pageSize: 10 } : false}
            className={styles.table}
          />
        )
      }
    ];

    if (Array.isArray(displayEvent?.rooms) && displayEvent.rooms.length > 0) {
      baseItems.push({
        key: 'rooms',
        label: <><DesktopOutlined /> 涉及机房 ({displayEvent.rooms.length})</>,
        children: (
          <div className={styles.roomList}>
            {displayEvent.rooms.map(room => (
              <div key={room?.id || Math.random()} className={styles.roomItem}>
                <div className={styles.roomName}>{room?.name || '-'}</div>
                <div className={styles.roomInfo}>
                  <div className={styles.infoItem}>
                    <span className={styles.label}>机柜数:</span>
                    <span className={styles.value}>{room?.cabinet_count || 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      });
    }

    // 添加设备标签页
    if (Array.isArray(displayEvent?.devices) && displayEvent.devices.length > 0) {
      const deviceColumns = [
        {
          title: '品牌',
          dataIndex: 'brand',
          key: 'brand',
        },
        {
          title: '型号',
          dataIndex: 'model',
          key: 'model',
        },
        {
          title: 'SN',
          dataIndex: 'sn',
          key: 'sn',
        },
        {
          title: '设备类型',
          dataIndex: 'device_type',
          key: 'device_type',
          render: (text) => {
            const typeMap = {
              'server': '服务器',
              'switch': '交换机',
              'router': '路由器',
              'firewall': '防火墙',
              'storage': '存储设备',
              'ups': 'UPS',
              'pdu': 'PDU',
              'other': '其他'
            };
            return typeMap[text] || text;
          }
        },
        {
          title: 'U数',
          dataIndex: 'u_size',
          key: 'u_size',
        },
        {
          title: '机架位置',
          dataIndex: 'rack_position',
          key: 'rack_position',
        },
        {
          title: '电源',
          dataIndex: 'power',
          key: 'power',
        },
        {
          title: '所在机柜',
          dataIndex: 'cabinet_name',
          key: 'cabinet_name',
        }
      ];

      baseItems.push({
        key: 'devices',
        label: <><HddOutlined /> 关联设备 ({displayEvent.devices.length})</>,
        children: (
          <Table
            dataSource={displayEvent.devices}
            columns={deviceColumns}
            rowKey="id"
            pagination={displayEvent.devices.length > 10 ? { pageSize: 10 } : false}
            className={styles.table}
          />
        )
      });
    }

    return baseItems;
  }, [displayEvent, entryPersonnel, loading, personnelColumns]);

  return (
    <Modal
      title="事件详情"
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="close" onClick={onClose}>关闭</Button>,
        <Button key="edit" type="primary" icon={<EditOutlined />} onClick={handleEdit}>编辑</Button>
      ]}
    >
      {detailError && (
        <div className={styles.errorTip} style={{ marginBottom: 16, color: '#ff4d4f' }}>
          {detailError}
        </div>
      )}
      <Tabs 
        defaultActiveKey="basic"
        items={tabItems}
      />
    </Modal>
  );
};

EventDetails.propTypes = {
  visible: PropTypes.bool.isRequired,
  event: PropTypes.object,
  onClose: PropTypes.func.isRequired
};

export default EventDetails;
