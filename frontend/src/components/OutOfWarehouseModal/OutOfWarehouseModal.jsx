/**
 * 出库设备模态框组件
 * 用于将仓库设备标记为出库
 * 
 * @param {Object} props - 组件属性
 * @param {boolean} props.visible - 是否显示模态框
 * @param {Object} props.warehouseDevice - 要出库的仓库设备
 * @param {Function} props.onFinish - 出库成功的回调
 * @param {Function} props.onCancel - 取消操作的回调
 * @returns {React.ReactElement} 出库设备模态框组件
 */
import React, { useState, useEffect } from 'react';
import { Modal, Form, DatePicker, TimePicker, Input, Select, Button, message } from 'antd';
import dayjs from 'dayjs';
import api from '../../api';
import { warehouseDeviceAPI } from '../../api/warehouseDeviceAPI';

const { TextArea } = Input;
const { Option } = Select;

const OutOfWarehouseModal = ({ visible, warehouseDevice, onFinish, onCancel }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);

  // 获取事件列表
  useEffect(() => {
    if (visible) {
      fetchEvents();
      form.setFieldsValue({
        action_date: dayjs(),
        action_time: dayjs()
      });
    }
  }, [visible, form]);

  /**
   * 获取事件列表
   */
  const fetchEvents = async () => {
    try {
      const response = await api.getEvents();
      setEvents(response.data.results || response.data || []);
    } catch (error) {
      // 静默失败，事件是可选的
    }
  };

  /**
   * 表单提交处理
   * @param {Object} values - 表单值
   */
  const handleSubmit = async (values) => {
    if (!warehouseDevice || !warehouseDevice.id) {
      message.error('缺少仓库设备信息');
      return;
    }

    setLoading(true);
    try {
      const outData = {
        action_date: values.action_date ? values.action_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        action_time: values.action_time ? values.action_time.format('HH:mm:ss') : null,
        out_reason: values.out_reason,
        event_id: values.event_id,
        notes: values.notes
      };

      await warehouseDeviceAPI.outOfWarehouse(warehouseDevice.id, outData);
      message.success('设备出库成功');
      form.resetFields();
      onFinish && onFinish();
    } catch (error) {
      console.error('设备出库失败:', error);
      message.error('设备出库失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理取消操作
   */
  const handleCancel = () => {
    form.resetFields();
    onCancel && onCancel();
  };

  return (
    <Modal
      title="设备出库"
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={600}
    >
      {warehouseDevice && (
        <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <strong>设备信息：</strong>
          {warehouseDevice.brand} {warehouseDevice.model} 
          (SN: {warehouseDevice.sn})
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <Form.Item
          name="action_date"
          label="出库日期"
          rules={[{ required: true, message: '请选择出库日期' }]}
        >
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>

        <Form.Item
          name="action_time"
          label="出库时间"
        >
          <TimePicker style={{ width: '100%' }} format="HH:mm:ss" />
        </Form.Item>

        <Form.Item
          name="out_reason"
          label="出库原因"
          rules={[{ required: true, message: '请输入出库原因' }]}
        >
          <TextArea rows={3} placeholder="请输入出库原因" />
        </Form.Item>

        <Form.Item
          name="event_id"
          label="关联事件（可选）"
        >
          <Select placeholder="请选择关联事件（可选）">
            {events.map(event => (
              <Option key={event.id} value={event.id}>
                {event.order_number ? `${event.order_number} (${event.date})` : `事件 #${event.id} (${event.date})`}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="notes"
          label="备注"
        >
          <TextArea rows={3} placeholder="请输入备注信息" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} style={{ marginRight: 8 }}>
            确认出库
          </Button>
          <Button onClick={handleCancel}>
            取消
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default OutOfWarehouseModal;

