import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Form, Row, Col, Input, Button, DatePicker, Select, Space } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { useClientOptions, useRoomOptions } from '../../../../hooks/useSelectOptions';
import styles from './EventSearch.module.css';

const { RangePicker } = DatePicker;
const { Option } = Select;

/**
 * 事件搜索组件（日期范围、订单号、客户、机房、完成状态）
 */
const EventSearch = ({ onSearch, onReset }) => {
  const [form] = Form.useForm();
  const [expanded, setExpanded] = useState(false);
  const { options: clientOptions, loading: clientsLoading } = useClientOptions();
  const { options: roomOptions, loading: roomsLoading } = useRoomOptions();

  // 处理搜索
  const handleSearch = () => {
    const values = form.getFieldsValue();
    onSearch(values);
  };

  // 重置表单
  const handleReset = () => {
    form.resetFields();
    onReset();
  };

  // 切换显示更多搜索条件
  const toggleExpand = () => {
    setExpanded(!expanded);
  };

  return (
    <div className={styles.searchFormContainer}>
      <Form 
        form={form}
        layout="horizontal"
        className={styles.searchForm}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Form.Item name="dateRange" label="日期范围">
              <RangePicker 
                className={styles.fullWidth}
                format="YYYY-MM-DD"
              />
            </Form.Item>
          </Col>
          
          <Col xs={24} sm={12} md={8} lg={6}>
            <Form.Item name="orderNumber" label="订单号">
              <Input placeholder="请输入订单号" allowClear />
            </Form.Item>
          </Col>
          
          <Col xs={24} sm={12} md={8} lg={6}>
            <Form.Item name="clientId" label="客户">
              <Select
                placeholder="请选择客户"
                allowClear
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toString().toLowerCase().includes((input || '').toLowerCase())
                }
                loading={clientsLoading}
                options={clientOptions}
              />
            </Form.Item>
          </Col>

          {expanded && (
            <>
              <Col xs={24} sm={12} md={8} lg={6}>
                <Form.Item name="roomId" label="机房">
                  <Select
                    placeholder="请选择机房"
                    allowClear
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toString().toLowerCase().includes((input || '').toLowerCase())
                    }
                    loading={roomsLoading}
                    options={roomOptions}
                  />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={8} lg={6}>
                <Form.Item name="completion_status" label="状态">
                  <Select placeholder="请选择状态" allowClear>
                    <Option value="true">已完成</Option>
                    <Option value="false">未完成</Option>
                  </Select>
                </Form.Item>
              </Col>
            </>
          )}
          
          <Col xs={24} className={styles.buttonCol}>
            <Space>
              <Button 
                type="primary" 
                onClick={handleSearch}
                icon={<SearchOutlined />}
              >
                搜索
              </Button>
              
              <Button 
                onClick={handleReset}
                icon={<ReloadOutlined />}
              >
                重置
              </Button>
              
              <Button 
                type="link" 
                onClick={toggleExpand}
              >
                {expanded ? '收起' : '展开'}
              </Button>
            </Space>
          </Col>
        </Row>
      </Form>
    </div>
  );
};

EventSearch.propTypes = {
  onSearch: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired
};

export default EventSearch; 
