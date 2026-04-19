import React, { useState, useEffect } from 'react';
import { Badge, Popover, Button, List, Empty, Typography, message } from 'antd';
import { BellOutlined, MoreOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { notificationAPI } from '../../api';
import useAuth from '../../hooks/useAuth';
import dayjs from 'dayjs';
import './NotificationBell.css';

const { Text } = Typography;

/**
 * 消息铃铛组件
 */
const NotificationBell = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // 判断是否为管理员
  const isAdmin = user && (user.is_staff === true || user.is_superuser === true);

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
    // 每30秒刷新一次未读数量
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const response = await notificationAPI.list();
      const data = response.data.results || response.data || [];
      setNotifications(data.slice(0, 10)); // 只显示最近10条
    } catch (error) {
      console.error('获取消息列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await notificationAPI.unreadCount();
      setUnreadCount(response.data.count || 0);
    } catch (error) {
      console.error('获取未读数量失败:', error);
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await notificationAPI.markRead(id);
      await fetchNotifications();
      await fetchUnreadCount();
    } catch (error) {
      console.error('标记已读失败:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationAPI.markAllRead();
      await fetchNotifications();
      await fetchUnreadCount();
    } catch (error) {
      console.error('标记全部已读失败:', error);
    }
  };

  // 处理通知点击
  const handleNotificationClick = (notification) => {
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

  const notificationContent = (
    <div className="notification-popover">
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid #f0f0f0',
        marginBottom: 8
      }}>
        <Text strong>消息通知</Text>
        <div>
          {unreadCount > 0 && (
            <Button 
              type="link" 
              size="small"
              onClick={handleMarkAllRead}
              style={{ paddingRight: 8 }}
            >
              全部已读
            </Button>
          )}
          <Button 
            type="link" 
            size="small"
            icon={<MoreOutlined />}
            onClick={() => {
              navigate('/notifications');
            }}
          >
            更多
          </Button>
        </div>
      </div>
      {notifications.length === 0 ? (
        <Empty description="暂无消息" style={{ padding: '20px 0' }} />
      ) : (
        <List
          dataSource={notifications}
          loading={loading}
          itemLayout="vertical"
          style={{ maxHeight: 400, overflow: 'auto' }}
          renderItem={(item) => (
            <List.Item
              className={item.is_read ? 'notification-item-read' : 'notification-item-unread'}
              onClick={() => {
                if (!item.is_read) {
                  handleMarkRead(item.id);
                }
                // 处理通知点击跳转
                handleNotificationClick(item);
              }}
              style={{ 
                cursor: 'pointer',
                padding: '12px',
                borderBottom: '1px solid #f0f0f0'
              }}
            >
              <List.Item.Meta
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong={!item.is_read}>{item.title}</Text>
                    {!item.is_read && <Badge status="processing" />}
                  </div>
                }
                description={
                  <div>
                    <div>{item.content}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
                      {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
                    </div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );

  return (
    <Popover
      content={notificationContent}
      title={null}
      trigger="click"
      placement="bottomRight"
      overlayStyle={{ width: 360 }}
      onOpenChange={(open) => {
        if (open) {
          fetchNotifications();
        }
      }}
    >
      <Badge count={unreadCount} overflowCount={99}>
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          style={{ marginRight: 8 }}
        />
      </Badge>
    </Popover>
  );
};

export default NotificationBell;

