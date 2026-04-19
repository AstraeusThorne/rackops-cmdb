import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  InputNumber,
  Button,
  Row,
  Col,
  message,
  Spin,
  Divider,
  Space,
  Typography
} from 'antd';
import {
  SaveOutlined,
  ReloadOutlined,
  UndoOutlined,
  SettingOutlined,
  WarningOutlined,
  EyeOutlined
} from '@ant-design/icons';
import { useConfig } from '../../contexts/ConfigContext';
import { defaultConfig } from '../../config/systemConfig';

const { Title } = Typography;

/**
 * 系统配置管理页面
 * 提供告警阈值和显示配置的设置界面
 */
const SystemConfig = () => {
  const { config, loading, updateConfig, refreshConfig, resetConfig } = useConfig();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // 初始化表单值
  useEffect(() => {
    if (config) {
      form.setFieldsValue({
        // 告警阈值
        currentWarning: config.alertThresholds?.current?.warning,
        currentCritical: config.alertThresholds?.current?.critical,
        voltageMin: config.alertThresholds?.voltage?.min,
        voltageMax: config.alertThresholds?.voltage?.max,
        voltageWarningMin: config.alertThresholds?.voltage?.warning?.min,
        voltageWarningMax: config.alertThresholds?.voltage?.warning?.max,
        powerWarning: config.alertThresholds?.power?.warning,
        powerCritical: config.alertThresholds?.power?.critical,
        powerFactorMin: config.alertThresholds?.powerFactor?.min,
        
        // 显示配置
        currentProgressMax: config.displaySettings?.currentProgressMax,
        chartHeightDefault: config.displaySettings?.chartHeight?.default,
        chartHeightDetail: config.displaySettings?.chartHeight?.detail,
        historyDataDays: config.displaySettings?.historyDataDays,
        chartXAxisInterval: config.displaySettings?.chartXAxisInterval,
        voltageNominal: config.displaySettings?.voltageNominal,
        loadRateThreshold: config.displaySettings?.loadRateThreshold
      });
    }
  }, [config, form]);

  /**
   * 保存配置
   */
  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();

      const newConfig = {
        alertThresholds: {
          current: {
            warning: values.currentWarning,
            critical: values.currentCritical
          },
          voltage: {
            min: values.voltageMin,
            max: values.voltageMax,
            warning: {
              min: values.voltageWarningMin,
              max: values.voltageWarningMax
            }
          },
          power: {
            warning: values.powerWarning,
            critical: values.powerCritical
          },
          powerFactor: {
            min: values.powerFactorMin
          }
        },
        displaySettings: {
          currentProgressMax: values.currentProgressMax,
          chartHeight: {
            default: values.chartHeightDefault,
            detail: values.chartHeightDetail
          },
          historyDataDays: values.historyDataDays,
          chartXAxisInterval: values.chartXAxisInterval,
          voltageNominal: values.voltageNominal,
          loadRateThreshold: values.loadRateThreshold
        }
      };

      await updateConfig(newConfig, true);
      message.success('配置保存成功');
    } catch (error) {
      console.error('保存配置失败:', error);
      if (error.errorFields) {
        message.error('请检查表单输入');
      } else {
        message.error('保存配置失败: ' + (error.message || '未知错误'));
      }
    } finally {
      setSaving(false);
    }
  };

  /**
   * 刷新配置
   */
  const handleRefresh = async () => {
    try {
      await refreshConfig();
      message.success('配置已刷新');
    } catch (error) {
      message.error('刷新配置失败');
    }
  };

  /**
   * 重置为默认值
   */
  const handleReset = async () => {
    try {
      await resetConfig();
      form.setFieldsValue({
        // 告警阈值
        currentWarning: defaultConfig.alertThresholds.current.warning,
        currentCritical: defaultConfig.alertThresholds.current.critical,
        voltageMin: defaultConfig.alertThresholds.voltage.min,
        voltageMax: defaultConfig.alertThresholds.voltage.max,
        voltageWarningMin: defaultConfig.alertThresholds.voltage.warning.min,
        voltageWarningMax: defaultConfig.alertThresholds.voltage.warning.max,
        powerWarning: defaultConfig.alertThresholds.power.warning,
        powerCritical: defaultConfig.alertThresholds.power.critical,
        powerFactorMin: defaultConfig.alertThresholds.powerFactor.min,
        
        // 显示配置
        currentProgressMax: defaultConfig.displaySettings.currentProgressMax,
        chartHeightDefault: defaultConfig.displaySettings.chartHeight.default,
        chartHeightDetail: defaultConfig.displaySettings.chartHeight.detail,
        historyDataDays: defaultConfig.displaySettings.historyDataDays,
        chartXAxisInterval: defaultConfig.displaySettings.chartXAxisInterval,
        voltageNominal: defaultConfig.displaySettings.voltageNominal,
        loadRateThreshold: defaultConfig.displaySettings.loadRateThreshold
      });
      message.success('已重置为默认值');
    } catch (error) {
      message.error('重置配置失败');
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>加载配置中...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2} style={{ margin: 0 }}>
          <SettingOutlined /> 系统配置管理
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
            刷新
          </Button>
          <Button icon={<UndoOutlined />} onClick={handleReset}>
            重置默认值
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            保存配置
          </Button>
        </Space>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={defaultConfig}
      >
        {/* 告警阈值配置 */}
        <Card
          title={
            <span>
              <WarningOutlined /> 告警阈值配置
            </span>
          }
          style={{ marginBottom: 24 }}
        >
          <Row gutter={16}>
            <Col span={24}>
              <Title level={4}>电流告警阈值（2路总电流，单位：A）</Title>
            </Col>
            <Col span={12}>
              <Form.Item
                label="警告阈值"
                name="currentWarning"
                rules={[{ required: true, message: '请输入警告阈值' }]}
              >
                <InputNumber
                  min={0}
                  max={100}
                  step={0.1}
                  style={{ width: '100%' }}
                  placeholder="例如：10"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="严重阈值"
                name="currentCritical"
                rules={[{ required: true, message: '请输入严重阈值' }]}
              >
                <InputNumber
                  min={0}
                  max={100}
                  step={0.1}
                  style={{ width: '100%' }}
                  placeholder="例如：20"
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Row gutter={16}>
            <Col span={24}>
              <Title level={4}>电压阈值（单位：V）</Title>
            </Col>
            <Col span={8}>
              <Form.Item
                label="最低电压"
                name="voltageMin"
                rules={[{ required: true, message: '请输入最低电压' }]}
              >
                <InputNumber
                  min={0}
                  max={500}
                  step={1}
                  style={{ width: '100%' }}
                  placeholder="例如：200"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="最高电压"
                name="voltageMax"
                rules={[{ required: true, message: '请输入最高电压' }]}
              >
                <InputNumber
                  min={0}
                  max={500}
                  step={1}
                  style={{ width: '100%' }}
                  placeholder="例如：250"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="警告范围 - 最低"
                name="voltageWarningMin"
                rules={[{ required: true, message: '请输入警告最低电压' }]}
              >
                <InputNumber
                  min={0}
                  max={500}
                  step={1}
                  style={{ width: '100%' }}
                  placeholder="例如：210"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="警告范围 - 最高"
                name="voltageWarningMax"
                rules={[{ required: true, message: '请输入警告最高电压' }]}
              >
                <InputNumber
                  min={0}
                  max={500}
                  step={1}
                  style={{ width: '100%' }}
                  placeholder="例如：240"
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Row gutter={16}>
            <Col span={24}>
              <Title level={4}>功率告警阈值（单位：W）</Title>
            </Col>
            <Col span={12}>
              <Form.Item
                label="警告阈值"
                name="powerWarning"
                rules={[{ required: true, message: '请输入功率警告阈值' }]}
              >
                <InputNumber
                  min={0}
                  step={100}
                  style={{ width: '100%' }}
                  placeholder="例如：3500"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="严重阈值"
                name="powerCritical"
                rules={[{ required: true, message: '请输入功率严重阈值' }]}
              >
                <InputNumber
                  min={0}
                  step={100}
                  style={{ width: '100%' }}
                  placeholder="例如：4500"
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="功率因数最低值"
                name="powerFactorMin"
                rules={[{ required: true, message: '请输入功率因数最低值' }]}
              >
                <InputNumber
                  min={0}
                  max={1}
                  step={0.01}
                  style={{ width: '100%' }}
                  placeholder="例如：0.8"
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* 显示配置 */}
        <Card
          title={
            <span>
              <EyeOutlined /> 显示配置
            </span>
          }
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="电流进度条最大值（单位：A）"
                name="currentProgressMax"
                rules={[{ required: true, message: '请输入电流进度条最大值' }]}
              >
                <InputNumber
                  min={1}
                  max={100}
                  step={1}
                  style={{ width: '100%' }}
                  placeholder="例如：32"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="历史数据查询天数"
                name="historyDataDays"
                rules={[{ required: true, message: '请输入历史数据查询天数' }]}
              >
                <InputNumber
                  min={1}
                  max={30}
                  step={1}
                  style={{ width: '100%' }}
                  placeholder="例如：1"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="默认图表高度（单位：px）"
                name="chartHeightDefault"
                rules={[{ required: true, message: '请输入默认图表高度' }]}
              >
                <InputNumber
                  min={100}
                  max={1000}
                  step={10}
                  style={{ width: '100%' }}
                  placeholder="例如：200"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="详情图表高度（单位：px）"
                name="chartHeightDetail"
                rules={[{ required: true, message: '请输入详情图表高度' }]}
              >
                <InputNumber
                  min={100}
                  max={1000}
                  step={10}
                  style={{ width: '100%' }}
                  placeholder="例如：300"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="图表X轴标签间隔（单位：小时）"
                name="chartXAxisInterval"
                rules={[{ required: true, message: '请输入X轴标签间隔' }]}
              >
                <InputNumber
                  min={1}
                  max={24}
                  step={1}
                  style={{ width: '100%' }}
                  placeholder="例如：4"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="电压基准值（单位：V）"
                name="voltageNominal"
                rules={[{ required: true, message: '请输入电压基准值' }]}
              >
                <InputNumber
                  min={0}
                  max={500}
                  step={1}
                  style={{ width: '100%' }}
                  placeholder="例如：220"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="负载率告警阈值（0-1之间的小数）"
                name="loadRateThreshold"
                rules={[{ required: true, message: '请输入负载率告警阈值' }]}
              >
                <InputNumber
                  min={0}
                  max={1}
                  step={0.01}
                  style={{ width: '100%' }}
                  placeholder="例如：0.8"
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Form>
    </div>
  );
};

export default SystemConfig;
