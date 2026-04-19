import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Form, Input, Select, Button, message, Row, Col, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import { deviceAlertAPI, deviceAPI, dutyPersonnelAPI } from '../../../../api';
import './style.css';

const { Option } = Select;
const { TextArea } = Input;

const SEARCH_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * 创建设备告警组件
 * @returns {React.ReactElement} 创建设备告警表单
 */
const CreateAlert = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [deviceSearching, setDeviceSearching] = useState(false);
  const [existingAlerts, setExistingAlerts] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [dutyPersonnel, setDutyPersonnel] = useState([]);
  const navigate = useNavigate();
  const searchTimerRef = useRef(null);

  // 远程搜索设备（后端 search 支持 SN/品牌/型号等，避免全量拉取）
  const searchDevices = useCallback(async (keyword) => {
    setDeviceSearching(true);
    try {
      const res = await deviceAPI.getDevices({
        search: (keyword || '').trim(),
        page_size: SEARCH_PAGE_SIZE,
        page: 1
      });
      const data = res.data || {};
      const list = data.results || (Array.isArray(data) ? data : []);
      setDevices(Array.isArray(list) ? list : []);
    } catch (error) {
      message.error('获取设备列表失败');
      setDevices([]);
    } finally {
      setDeviceSearching(false);
    }
  }, []);

  /** 关联设备下拉：输入时防抖触发远程搜索；空关键词时拉第一页 */
  const handleDeviceSearch = useCallback((value) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      searchDevices(value);
    }, SEARCH_DEBOUNCE_MS);
  }, [searchDevices]);

  /** 下拉展开时若尚未加载过，拉第一页 */
  const handleDeviceDropdownVisibleChange = useCallback((open) => {
    if (open && devices.length === 0 && !deviceSearching) {
      searchDevices('');
    }
  }, [devices.length, deviceSearching, searchDevices]);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await deviceAlertAPI.getDeviceAlerts();
        const alertMap = {};
        const alertsData = response.data.results || response.data || [];
        alertsData.forEach(alert => {
          if (alert.status === 'active' || alert.status === 'acknowledged') {
            alertMap[alert.device] = alert;
          }
        });
        setExistingAlerts(alertMap);
      } catch (error) {
        console.error('获取告警列表失败:', error);
      }
    };
    fetchAlerts();
  }, []);

  /**
   * 加载值班人员列表
   */
  useEffect(() => {
    const fetchDutyPersonnel = async () => {
      try {
        const res = await dutyPersonnelAPI.getDutyPersonnel();
        setDutyPersonnel(res.data?.results || res.data || []);
      } catch (error) {
        message.error('获取值班人员列表失败');
      }
    };
    fetchDutyPersonnel();
  }, []);

  /**
   * 检查设备是否已有活跃告警
   * @param {number} deviceId - 设备ID
   * @returns {boolean} 是否有活跃告警
   */
  const hasActiveAlert = (deviceId) => {
    return Boolean(existingAlerts[deviceId]);
  };

  /**
   * 处理设备选择变化
   * @param {number} value - 设备ID
   */
  const handleDeviceChange = (value) => {
    setErrorMessage('');
    
    if (hasActiveAlert(value)) {
      const alert = existingAlerts[value];
      setErrorMessage(`该设备已存在活跃告警，告警标题: "${alert.title}"，状态: ${alert.status_display}`);
    }
  };

  /**
   * 提交表单
   * @param {Object} values - 表单值
   */
  const handleSubmit = async (values) => {
    // 再次检查设备是否已有活跃告警
    if (hasActiveAlert(values.device)) {
      setErrorMessage(`该设备已存在活跃告警，不允许创建新告警`);
      return;
    }

    setLoading(true);
    try {
      await deviceAlertAPI.createDeviceAlert(values);
      message.success('告警创建成功');
      navigate('/device-alert');
    } catch (error) {
      const errorMsg = error.response?.data?.non_field_errors?.[0] || 
                      error.response?.data?.error || 
                      error.message || 
                      '创建告警失败';
                      
      message.error(`创建告警失败: ${errorMsg}`);
      console.error('创建告警失败:', error);
      
      // 如果后端返回的错误信息中包含"已存在活跃告警"，则设置错误消息
      if (error.response?.data?.non_field_errors && 
          String(error.response.data.non_field_errors).includes('已存在活跃告警')) {
        setErrorMessage(error.response.data.non_field_errors[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-alert-container">
      <Card title="创建设备告警" className="create-alert-form">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            level: 'warning',
            status: 'active'
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="title"
                label="告警标题"
                rules={[{ required: true, message: '请输入告警标题' }]}
              >
                <Input placeholder="输入告警标题" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="level"
                label="告警级别"
                rules={[{ required: true, message: '请选择告警级别' }]}
              >
                <Select placeholder="选择告警级别">
                  <Option value="info">提示</Option>
                  <Option value="warning">警告</Option>
                  <Option value="critical">严重</Option>
                  <Option value="emergency">紧急</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="告警描述"
            rules={[{ required: true, message: '请输入告警描述' }]}
          >
            <TextArea rows={4} placeholder="输入告警描述" />
          </Form.Item>

          <Form.Item
            name="duty_personnel"
            label="值班人员"
          >
            <Select placeholder="可选，选择当前负责的值班人员" allowClear>
              {Array.isArray(dutyPersonnel) && dutyPersonnel.map(person => (
                <Option key={person.id} value={person.id}>
                  {person.name || person.employee_id || `值班人员#${person.id}`}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="device"
            label="关联设备"
            rules={[{ required: true, message: '请选择关联设备' }]}
            help={errorMessage ? <Alert message={errorMessage} type="error" showIcon /> : null}
            validateStatus={errorMessage ? 'error' : ''}
          >
            <Select
              placeholder="输入 SN / 品牌 / 型号 搜索设备"
              showSearch
              filterOption={false}
              onSearch={handleDeviceSearch}
              onDropdownVisibleChange={handleDeviceDropdownVisibleChange}
              loading={deviceSearching}
              notFoundContent={deviceSearching ? '搜索中...' : '输入关键词搜索或展开下拉加载'}
              onChange={handleDeviceChange}
            >
              {Array.isArray(devices) && devices.map(device => {
                const label = `${device.brand || ''} ${device.model || ''} - SN: ${device.sn || ''}${hasActiveAlert(device.id) ? ' (已有活跃告警)' : ''}`;
                return (
                  <Option
                    key={device.id}
                    value={device.id}
                    label={label}
                    disabled={hasActiveAlert(device.id)}
                  >
                    {label}
                  </Option>
                );
              })}
            </Select>
          </Form.Item>

          <Form.Item
            name="status"
            label="告警状态"
            hidden
          >
            <Input />
          </Form.Item>

          <div className="buttons-container">
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading} 
              style={{ marginRight: 16 }}
              disabled={!!errorMessage}
            >
              创建告警
            </Button>
            <Button onClick={() => navigate('/device-alert')}>
              取消
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default CreateAlert;