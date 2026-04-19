import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, message, DatePicker } from 'antd';
import dayjs from 'dayjs';
import * as deviceAlertAPI from '../../../../api/deviceAlertAPI';

const { TextArea } = Input;
const { Option } = Select;

/**
 * 解决告警模态框组件
 * @param {Object} props - 组件属性
 * @param {boolean} props.visible - 是否显示
 * @param {function} props.onCancel - 取消回调
 * @param {function} props.onSuccess - 成功回调
 * @param {Object} props.alert - 当前告警对象
 * @param {Array} props.dutyPersonnel - 值班人员列表
 * @returns {React.ReactElement} 解决告警模态框
 */
const ResolveAlertModal = ({ visible, onCancel, onSuccess, alert, dutyPersonnel }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // 当模态框显示时重置表单
  useEffect(() => {
    if (visible && alert) {
      form.resetFields();
      // 设置当前时间为默认解决时间
      form.setFieldsValue({
        resolved_at: dayjs(),
        duty_personnel: alert?.duty_personnel || undefined
      });
    }
  }, [visible, form, alert]);

  // 组件卸载时重置表单
  useEffect(() => {
    return () => {
      if (form) {
        form.resetFields();
      }
    };
  }, [form]);

  /**
   * 格式化日期用于显示（精确到日）
   * @param {Date|string} dateTime - 日期时间对象或字符串
   * @returns {string} 格式化后的日期字符串，如 2025/2/21
   */
  const formatDate = (dateTime) => {
    if (!dateTime) return '-';
    const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
  };

  /**
   * 提交表单
   */
  const handleSubmit = async () => {
    if (!alert) return;
    
    try {
      const values = await form.validateFields();
      setLoading(true);

      // 准备解决告警数据，确保类型正确
      const resolveData = {
        resolution_notes: String(values.resolution_notes?.trim() || ''),
        duty_personnel: values.duty_personnel ? Number(values.duty_personnel) : null,
        resolved_at: values.resolved_at.format('YYYY-MM-DD HH:mm:ss')
      };
      
      console.log('解决告警数据:', resolveData);
      
      // 调用API解决告警
      await deviceAlertAPI.resolveAlert(alert.id, resolveData);
      
      message.success('告警已成功解除');
      onSuccess();
    } catch (error) {
      if (error.errorFields) {
        // 表单验证错误
        return;
      }
      
      console.error('解除告警失败:', error);
      console.error('请求数据:', error.config?.data);
      console.error('响应数据:', error.response?.data);
      
      let errorMsg = '解除告警失败';
      if (error.response?.data) {
        if (typeof error.response.data === 'string') {
          errorMsg += ': ' + error.response.data;
        } else if (error.response.data.detail) {
          errorMsg += ': ' + error.response.data.detail;
        } else if (error.response.data.error) {
          errorMsg += ': ' + error.response.data.error;
        } else if (typeof error.response.data === 'object') {
          // 处理多字段错误
          errorMsg += ': ' + Object.entries(error.response.data)
            .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
            .join('; ');
        }
      } else if (error.message) {
        errorMsg += ': ' + error.message;
      }
      
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="解除告警"
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={loading}
      destroyOnClose
      forceRender={true}
    >
      {alert && (
        <div style={{ marginBottom: 16 }}>
          <p><strong>告警标题:</strong> {alert.title}</p>
          <p><strong>告警级别:</strong> {alert.level_display || alert.level}</p>
          <p><strong>发现时间:</strong> {formatDate(alert.discovered_at)}</p>
        </div>
      )}
      
      <Form
        form={form}
        layout="vertical"
        preserve={false}
      >
        <Form.Item
          name="resolution_notes"
          label="解决方法"
          rules={[{ required: true, message: '请输入解决方法' }]}
        >
          <TextArea rows={4} placeholder="请描述问题的解决方法" />
        </Form.Item>

        <Form.Item
          name="duty_personnel"
          label="值班人员"
          rules={[{ required: true, message: '请选择值班人员' }]}
        >
          <Select placeholder="选择值班人员">
            {Array.isArray(dutyPersonnel) && dutyPersonnel.map(person => (
              <Option key={person.id} value={person.id}>
                {person.name} ({person.type})
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="resolved_at"
          label="解决时间"
          rules={[{ required: true, message: '请选择解决时间' }]}
        >
          <DatePicker 
            showTime 
            format="YYYY-MM-DD HH:mm:ss" 
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ResolveAlertModal;