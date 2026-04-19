import React, { useState, useEffect } from 'react';
import { Card, List, Badge, Button, Empty, Tag, Typography, Pagination, Spin, message } from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { notificationAPI } from '../../api';
import useAuth from '../../hooks/useAuth';
import dayjs from 'dayjs';
import './NotificationList.css';

const { Text, Title } = Typography;

/**
 * 通知列表页面
 * 显示所有历史通知，支持分页和筛选
 */
const NotificationList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // 判断是否为管理员
  const isAdmin = user && (user.is_staff === true || user.is_superuser === true);

  useEffect(() => {
    fetchNotifications(currentPage, pageSize);
    fetchUnreadCount();
  }, [currentPage, pageSize]);

  // 获取通知列表
  const fetchNotifications = async (page = 1, size = 20) => {
    setLoading(true);
    try {
      const response = await notificationAPI.list({ page, page_size: size });
      const data = response.data;
      // 处理分页响应格式（可能是 {results: [], count: 0} 或直接是数组）
      if (data.results) {
        setNotifications(data.results);
        setTotalCount(data.count || 0);
      } else if (Array.isArray(data)) {
        setNotifications(data);
        setTotalCount(data.length);
      } else {
        setNotifications([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error('获取通知列表失败:', error);
      setNotifications([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  // 获取未读数量
  const fetchUnreadCount = async () => {
    try {
      const response = await notificationAPI.unreadCount();
      setUnreadCount(response.data.count || 0);
    } catch (error) {
      console.error('获取未读数量失败:', error);
    }
  };

  // 标记为已读
  const handleMarkRead = async (id) => {
    try {
      await notificationAPI.markRead(id);
      await fetchNotifications(currentPage, pageSize);
      await fetchUnreadCount();
    } catch (error) {
      console.error('标记已读失败:', error);
    }
  };

  // 标记全部为已读
  const handleMarkAllRead = async () => {
    try {
      await notificationAPI.markAllRead();
      await fetchNotifications(currentPage, pageSize);
      await fetchUnreadCount();
    } catch (error) {
      console.error('标记全部已读失败:', error);
    }
  };

  // 获取通知类型标签
  const getNotificationTypeTag = (type) => {
    const typeMap = {
      'account_approved': { text: '账户审核', color: 'success' },
      'account_rejected': { text: '账户审核', color: 'error' },
      'account_pending': { text: '账户审核', color: 'warning' },
      'new_event': { text: '新增事件', color: 'blue' },
      'event_updated': { text: '事件更新', color: 'cyan' },
      'new_alert': { text: '新增告警', color: 'red' },
      'system': { text: '系统通知', color: 'default' },
    };
    const typeInfo = typeMap[type] || { text: type, color: 'default' };
    return <Tag color={typeInfo.color}>{typeInfo.text}</Tag>;
  };

  // 处理通知点击
  const handleNotificationClick = (notification) => {
    // 如果未读，先标记为已读
    if (!notification.is_read) {
      handleMarkRead(notification.id);
    }
    
    // 检查是否需要管理员权限
    const requiresAdmin = 
      notification.notification_type === 'account_pending' ||
      notification.notification_type === 'account_approved' ||
      notification.notification_type === 'account_rejected' ||
      notification.related_content_type === 'DutyPersonnel' ||
      notification.related_content_type === 'common.DutyPersonnel';
    
    if (requiresAdmin && !isAdmin) {
      message.warning('权限不足：只有管理员可以访问此功能');
      return;
    }
    
    // 根据关联对象类型跳转
    if (notification.related_content_type && notification.related_object_id) {
      if (notification.related_content_type === 'events.Event') {
        navigate(`/event/list`);
      } else if (notification.related_content_type === 'devices.DeviceAlert') {
        navigate(`/device-alert`);
      } else if (notification.related_content_type === 'DutyPersonnel' || 
                 notification.related_content_type === 'common.DutyPersonnel') {
        if (isAdmin) {
          navigate(`/backoffice/duty-personnel-approval`);
        } else {
          message.warning('权限不足：只有管理员可以访问此功能');
        }
      }
    }
  };

  return (
    <div className="notification-list-page">
      <Card>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: 24
        }}>
          <Title level={3} style={{ margin: 0 }}>
            <BellOutlined style={{ marginRight: 8 }} />
            消息通知
          </Title>
          <div>
            <Text type="secondary" style={{ marginRight: 16 }}>
              未读消息：<Badge count={unreadCount} showZero style={{ backgroundColor: '#52c41a' }} />
            </Text>
            {unreadCount > 0 && (
              <Button 
                type="primary" 
                icon={<CheckOutlined />}
                onClick={handleMarkAllRead}
              >
                全部标记为已读
              </Button>
            )}
          </div>
        </div>

        <Spin spinning={loading}>
          {notifications.length === 0 ? (
            <Empty 
              description="暂无消息通知" 
              style={{ padding: '60px 0' }}
            />
          ) : (
            <>
              <List
                dataSource={notifications}
                itemLayout="vertical"
                renderItem={(item) => (
                  <List.Item
                    className={item.is_read ? 'notification-item-read' : 'notification-item-unread'}
                    onClick={() => handleNotificationClick(item)}
                    style={{ 
                      cursor: 'pointer',
                      padding: '16px',
                      borderBottom: '1px solid #f0f0f0',
                      borderRadius: 4,
                      marginBottom: 8,
                      transition: 'all 0.3s'
                    }}
                    onMouseEnter={(e) => {
                      if (!item.is_read) {
                        e.currentTarget.style.backgroundColor = '#e6f7ff';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = item.is_read ? '#fff' : '#f0f9ff';
                    }}
                  >
                    <List.Item.Meta
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {getNotificationTypeTag(item.notification_type)}
                            <Text strong={!item.is_read} style={{ fontSize: 16 }}>
                              {item.title}
                            </Text>
                            {!item.is_read && <Badge status="processing" />}
                          </div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {dayjs(item.created_at).format('YYYY-MM-DD HH:mm:ss')}
                          </Text>
                        </div>
                      }
                      description={
                        <div style={{ marginTop: 8 }}>
                          <Text>{item.content}</Text>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
              
              {totalCount > pageSize && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  marginTop: 24 
                }}>
                  <Pagination
                    current={currentPage}
                    pageSize={pageSize}
                    total={totalCount}
                    showSizeChanger
                    showQuickJumper
                    showTotal={(total) => `共 ${total} 条通知`}
                    onChange={(page, size) => {
                      setCurrentPage(page);
                      setPageSize(size);
                    }}
                    onShowSizeChange={(current, size) => {
                      setCurrentPage(1);
                      setPageSize(size);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </Spin>
      </Card>
    </div>
  );
};

export default NotificationList;

