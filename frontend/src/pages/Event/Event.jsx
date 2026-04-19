import React, { useCallback } from 'react';
import { Card, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import useEvents from '../../hooks/useEvents';
import EventSearch from './components/EventSearch/EventSearch';
import EventTable from './components/EventTable/EventTable';
import styles from './Event.module.css';

/**
 * 事件管理页面
 */
const Event = () => {
  const navigate = useNavigate();
  const { events, loading, pagination, setPagination, searchEvents, fetchEvents, deleteEvent } = useEvents();

  // 处理事件搜索
  const handleSearch = useCallback((values) => {
    const newPagination = { ...pagination, current: 1 };
    setPagination(newPagination);
    searchEvents(values, 1, pagination.pageSize);
  }, [searchEvents, pagination, setPagination]);

  // 重置搜索条件
  const handleReset = useCallback(() => {
    const newPagination = { ...pagination, current: 1 };
    setPagination(newPagination);
    fetchEvents(1, pagination.pageSize);
  }, [fetchEvents, pagination, setPagination]);

  // 新增事件
  const handleAdd = useCallback(() => {
    navigate('/event/create');
  }, [navigate]);

  // 编辑事件
  const handleEdit = useCallback((record) => {
    navigate(`/event/edit/${record.id}`);
  }, [navigate]);

  // 删除事件
  const handleDelete = useCallback((record) => {
    deleteEvent(record.id);
  }, [deleteEvent]);

  return (
    <div className={styles.eventPage}>
      <Card
        title="事件管理"
        extra={
          <Button type="primary" onClick={handleAdd} icon={<PlusOutlined />}>
            新增事件
          </Button>
        }
      >
        <EventSearch onSearch={handleSearch} onReset={handleReset} />
        
        <EventTable 
          events={events} 
          loading={loading}
          pagination={pagination}
          onPaginationChange={setPagination}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </Card>
    </div>
  );
};

export default Event; 