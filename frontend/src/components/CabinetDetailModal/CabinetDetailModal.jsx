import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  Tabs,
  Row,
  Col,
  Card,
  Statistic,
  Badge,
  Tag,
  Descriptions,
  Alert,
  Button,
  Space,
  Divider,
  Table,
  Empty,
  Spin,
  Select,
  Typography
} from 'antd';
import {
  ThunderboltOutlined,
  ReloadOutlined,
  DownloadOutlined,
  FullscreenOutlined
} from '@ant-design/icons';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { useCabinetPDU, usePDUHistory } from '../../hooks/usePDU';
import { formatPDUHistoryData, extractArrayFromResponse } from '../../utils/pduDataTransform';
import { pduPortAPI } from '../../api/pduAPI';
import { useConfig } from '../../contexts/ConfigContext';
import './CabinetDetailModal.css';

const { Option } = Select;
const { Text } = Typography;

const CabinetDetailModal = ({ 
  open, 
  onClose, 
  cabinet, 
  rooms = [],
  trendData = [],
  onRefresh,
  onExport 
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [pduPorts, setPduPorts] = useState([]);
  const [selectedPortId, setSelectedPortId] = useState(null);
  const [historyDataType, setHistoryDataType] = useState('current');

  // 获取机柜ID（从cabinet对象中提取）
  const cabinetId = useMemo(() => {
    if (!cabinet) return null;
    return cabinet.id || cabinet.cabinetId || null;
  }, [cabinet]);

  // 获取机柜的PDU数据
  const { 
    data: pduData, 
    loading: pduLoading, 
    error: pduError,
    transformedData: pduTransformedData 
  } = useCabinetPDU(cabinetId, {
    cabinetInfo: {
      id: cabinetId,
      name: cabinet?.cabinetName || cabinet?.name,
      location: cabinet?.location || '',
      room: cabinet?.room || ''
    }
  });

  // 获取PDU端口列表
  useEffect(() => {
    const fetchPorts = async () => {
      if (!cabinetId) return;
      try {
        const response = await pduPortAPI.getPortsByCabinet(cabinetId);
        
        // 从响应中提取端口数组
        const ports = extractArrayFromResponse(response, 'data');
        
        setPduPorts(ports);
        if (ports.length > 0) {
          setSelectedPortId(ports[0].id);
        }
      } catch (error) {
        console.error('Error fetching PDU ports:', error);
        setPduPorts([]);
      }
    };
    if (open && cabinetId) {
      fetchPorts();
    }
  }, [open, cabinetId]);

  // 获取历史数据（最近24小时）
  const endTime = useMemo(() => new Date(), []);
  const startTime = useMemo(() => {
    const date = new Date();
    date.setHours(date.getHours() - 24);
    return date;
  }, []);

  const { 
    data: historyData, 
    loading: historyLoading 
  } = usePDUHistory(selectedPortId, historyDataType, startTime, endTime);

  // 格式化历史数据为图表格式
  const chartHistoryData = useMemo(() => {
    if (!historyData || historyData.length === 0) {
      return [];
    }
    return formatPDUHistoryData(historyData, historyDataType);
  }, [historyData, historyDataType]);

  // 获取机房名称
  const getRoomName = (roomId) => {
    const room = rooms.find(r => r.roomId === roomId);
    return room ? room.roomName : roomId;
  };

  // 状态颜色映射
  const statusColors = {
    normal: '#52c41a',
    warning: '#faad14',
    critical: '#ff4d4f',
    offline: '#d9d9d9'
  };

  // 获取状态文本
  const getStatusText = (status) => {
    const statusMap = {
      normal: '正常',
      warning: '告警',
      critical: '严重',
      offline: '离线'
    };
    return statusMap[status] || status;
  };

  // 获取配置
  const { getAlertThresholds, getDisplaySettings } = useConfig();
  const alertThresholds = getAlertThresholds();
  const displaySettings = getDisplaySettings();

  // 计算电压偏差百分比
  const getVoltageDeviation = (voltage, nominal = null) => {
    const voltageNominal = nominal || displaySettings?.voltageNominal || 220;
    return ((voltage - voltageNominal) / voltageNominal * 100).toFixed(1);
  };

  // 获取功率因数等级
  const getPowerFactorGrade = (pf) => {
    const powerFactorMin = alertThresholds?.powerFactor?.min || 0.8;
    if (pf >= 0.95) return { text: '优秀', color: '#52c41a' };
    if (pf >= 0.90) return { text: '良好', color: '#1890ff' };
    if (pf >= powerFactorMin) return { text: '一般', color: '#faad14' };
    return { text: '较差', color: '#ff4d4f' };
  };

  // 生成趋势数据
  const chartData = useMemo(() => {
    if (!trendData || trendData.length === 0) {
      // 生成模拟数据
      const now = new Date();
      return Array.from({ length: 24 }, (_, i) => {
        const time = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
        return {
          time: time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          powerA: cabinet?.circuitA.power * (0.8 + Math.random() * 0.4) || 0,
          powerB: cabinet?.circuitB.power * (0.8 + Math.random() * 0.4) || 0,
          currentA: cabinet?.circuitA.current * (0.8 + Math.random() * 0.4) || 0,
          currentB: cabinet?.circuitB.current * (0.8 + Math.random() * 0.4) || 0,
          voltageA: cabinet?.circuitA.voltage * (0.95 + Math.random() * 0.1) || 0,
          voltageB: cabinet?.circuitB.voltage * (0.95 + Math.random() * 0.1) || 0,
          tempA: cabinet?.circuitA.temperature * (0.9 + Math.random() * 0.2) || 0,
          tempB: cabinet?.circuitB.temperature * (0.9 + Math.random() * 0.2) || 0
        };
      });
    }
    return trendData;
  }, [trendData, cabinet]);

  if (!cabinet) return null;

  return (
    <Modal
      title={
        <div className="modal-title">
          <Space>
            <ThunderboltOutlined />
            <span>{cabinet.cabinetName}</span>
            <Tag color={statusColors[cabinet.status]}>
              {getStatusText(cabinet.status)}
            </Tag>
          </Space>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={1200}
      className="cabinet-detail-modal"
      footer={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={onRefresh}>
            刷新数据
          </Button>
          <Button icon={<DownloadOutlined />} onClick={onExport}>
            导出报告
          </Button>
          <Button icon={<FullscreenOutlined />}>
            全屏查看
          </Button>
          <Button onClick={onClose}>关闭</Button>
        </Space>
      }
    >
      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab} 
        className="detail-tabs"
        items={[
          {
            key: 'overview',
            label: '概览',
            children: (
              <div className="overview-content">
                {/* 基本信息 */}
                <Card title="基本信息" className="info-card">
                  <Descriptions column={3} size="small">
                    <Descriptions.Item label="机柜ID">{cabinet.cabinetId}</Descriptions.Item>
                    <Descriptions.Item label="机柜名称">{cabinet.cabinetName}</Descriptions.Item>
                    <Descriptions.Item label="所属机房">{getRoomName(cabinet.room)}</Descriptions.Item>
                    <Descriptions.Item label="位置">{cabinet.location}</Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <Badge 
                        status={cabinet.status === 'normal' ? 'success' : 
                               cabinet.status === 'warning' ? 'warning' :
                               cabinet.status === 'critical' ? 'error' : 'default'}
                        text={getStatusText(cabinet.status)}
                      />
                    </Descriptions.Item>
                    <Descriptions.Item label="最后更新">
                      {new Date(cabinet.lastUpdate).toLocaleString()}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>

                {/* 总体统计 */}
                <Card title="总体统计" className="stats-card">
                  <Row gutter={16}>
                    <Col span={6}>
                      <Statistic
                        title="总功率"
                        value={cabinet.total.power}
                        precision={2}
                        suffix="kW"
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="总电流"
                        value={cabinet.total.current}
                        precision={2}
                        suffix="A"
                        valueStyle={{ color: '#52c41a' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="总能耗"
                        value={cabinet.total.energy}
                        precision={2}
                        suffix="kWh"
                        valueStyle={{ color: '#faad14' }}
                      />
                    </Col>
                    <Col span={6}>
                      <Statistic
                        title="负载率"
                        value={(cabinet.total.power / 10 * 100)}
                        precision={1}
                        suffix="%"
                        valueStyle={{ 
                          color: (cabinet.total.power / 10) > (displaySettings?.loadRateThreshold || 0.8) ? '#ff4d4f' : '#52c41a' 
                        }}
                      />
                    </Col>
                  </Row>
                </Card>

                {/* A/B回路对比 */}
                <Row gutter={16}>
                  <Col span={12}>
                    <Card title="A回路" className="circuit-card circuit-a">
                      <div className="circuit-status">
                        <Badge 
                          status={cabinet.circuitA.status === 'normal' ? 'success' : 'error'}
                          text={getStatusText(cabinet.circuitA.status)}
                        />
                      </div>
                      
                      <Row gutter={16}>
                        <Col span={12}>
                          <Statistic
                            title="电压"
                            value={cabinet.circuitA.voltage}
                            suffix="V"
                            precision={1}
                          />
                          <div className="voltage-deviation">
                            偏差: {getVoltageDeviation(cabinet.circuitA.voltage)}%
                          </div>
                        </Col>
                        <Col span={12}>
                          <Statistic
                            title="电流"
                            value={cabinet.circuitA.current}
                            suffix="A"
                            precision={2}
                          />
                        </Col>
                      </Row>

                      <Divider />

                      <Row gutter={16}>
                        <Col span={12}>
                          <Statistic
                            title="功率"
                            value={cabinet.circuitA.power}
                            suffix="kW"
                            precision={2}
                          />
                        </Col>
                        <Col span={12}>
                          <Statistic
                            title="功率因数"
                            value={cabinet.circuitA.powerFactor}
                            precision={3}
                          />
                          <Tag color={getPowerFactorGrade(cabinet.circuitA.powerFactor).color}>
                            {getPowerFactorGrade(cabinet.circuitA.powerFactor).text}
                          </Tag>
                        </Col>
                      </Row>

                      <Divider />

                      <Row gutter={16}>
                        <Col span={12}>
                          <Statistic
                            title="频率"
                            value={cabinet.circuitA.frequency}
                            suffix="Hz"
                            precision={2}
                          />
                        </Col>
                        <Col span={12}>
                          <Statistic
                            title="温度"
                            value={cabinet.circuitA.temperature}
                            suffix="°C"
                            precision={1}
                            valueStyle={{
                              color: cabinet.circuitA.temperature > 40 ? '#ff4d4f' : '#52c41a'
                            }}
                          />
                        </Col>
                      </Row>

                      <div className="energy-info">
                        <Statistic
                          title="累计能耗"
                          value={cabinet.circuitA.energy}
                          suffix="kWh"
                          precision={2}
                        />
                      </div>
                    </Card>
                  </Col>

                  <Col span={12}>
                    <Card title="B回路" className="circuit-card circuit-b">
                      <div className="circuit-status">
                        <Badge 
                          status={cabinet.circuitB.status === 'normal' ? 'success' : 'error'}
                          text={getStatusText(cabinet.circuitB.status)}
                        />
                      </div>
                      
                      <Row gutter={16}>
                        <Col span={12}>
                          <Statistic
                            title="电压"
                            value={cabinet.circuitB.voltage}
                            suffix="V"
                            precision={1}
                          />
                          <div className="voltage-deviation">
                            偏差: {getVoltageDeviation(cabinet.circuitB.voltage)}%
                          </div>
                        </Col>
                        <Col span={12}>
                          <Statistic
                            title="电流"
                            value={cabinet.circuitB.current}
                            suffix="A"
                            precision={2}
                          />
                        </Col>
                      </Row>

                      <Divider />

                      <Row gutter={16}>
                        <Col span={12}>
                          <Statistic
                            title="功率"
                            value={cabinet.circuitB.power}
                            suffix="kW"
                            precision={2}
                          />
                        </Col>
                        <Col span={12}>
                          <Statistic
                            title="功率因数"
                            value={cabinet.circuitB.powerFactor}
                            precision={3}
                          />
                          <Tag color={getPowerFactorGrade(cabinet.circuitB.powerFactor).color}>
                            {getPowerFactorGrade(cabinet.circuitB.powerFactor).text}
                          </Tag>
                        </Col>
                      </Row>

                      <Divider />

                      <Row gutter={16}>
                        <Col span={12}>
                          <Statistic
                            title="频率"
                            value={cabinet.circuitB.frequency}
                            suffix="Hz"
                            precision={2}
                          />
                        </Col>
                        <Col span={12}>
                          <Statistic
                            title="温度"
                            value={cabinet.circuitB.temperature}
                            suffix="°C"
                            precision={1}
                            valueStyle={{
                              color: cabinet.circuitB.temperature > 40 ? '#ff4d4f' : '#52c41a'
                            }}
                          />
                        </Col>
                      </Row>

                      <div className="energy-info">
                        <Statistic
                          title="累计能耗"
                          value={cabinet.circuitB.energy}
                          suffix="kWh"
                          precision={2}
                        />
                      </div>
                    </Card>
                  </Col>
                </Row>

                {/* 告警信息 */}
                {(cabinet.status === 'warning' || cabinet.status === 'critical') && (
                  <Alert
                    message="设备告警"
                    description={
                      <div>
                        {cabinet.status === 'critical' && <div>• 设备状态严重，请立即检查</div>}
                        {cabinet.circuitA.temperature > 40 && <div>• A回路温度过高: {cabinet.circuitA.temperature}°C</div>}
                        {cabinet.circuitB.temperature > 40 && <div>• B回路温度过高: {cabinet.circuitB.temperature}°C</div>}
                        {(cabinet.total.power / 10) > (displaySettings?.loadRateThreshold || 0.8) && <div>• 负载率过高: {(cabinet.total.power / 10 * 100).toFixed(1)}%</div>}
                      </div>
                    }
                    type={cabinet.status === 'critical' ? 'error' : 'warning'}
                    showIcon
                    className="alert-info"
                  />
                )}
              </div>
            )
          },
          {
            key: 'trends',
            label: '趋势分析',
            children: (
              <div className="trends-content">
                <Row gutter={16}>
                  <Col span={24}>
                    <Card title="功率趋势" className="chart-card">
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="time" />
                          <YAxis />
                          <RechartsTooltip />
                          <Legend />
                          <Line 
                            type="monotone" 
                            dataKey="powerA" 
                            stroke="#1890ff" 
                            name="A回路功率(kW)"
                            strokeWidth={2}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="powerB" 
                            stroke="#52c41a" 
                            name="B回路功率(kW)"
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col span={12}>
                    <Card title="电流趋势" className="chart-card">
                      <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="time" />
                          <YAxis />
                          <RechartsTooltip />
                          <Legend />
                          <Area 
                            type="monotone" 
                            dataKey="currentA" 
                            stackId="1"
                            stroke="#faad14" 
                            fill="#faad14"
                            name="A回路电流(A)"
                            fillOpacity={0.6}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="currentB" 
                            stackId="1"
                            stroke="#722ed1" 
                            fill="#722ed1"
                            name="B回路电流(A)"
                            fillOpacity={0.6}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>

                  <Col span={12}>
                    <Card title="电压趋势" className="chart-card">
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="time" />
                          <YAxis domain={['dataMin - 5', 'dataMax + 5']} />
                          <RechartsTooltip />
                          <Legend />
                          <Line 
                            type="monotone" 
                            dataKey="voltageA" 
                            stroke="#ff4d4f" 
                            name="A回路电压(V)"
                            strokeWidth={2}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="voltageB" 
                            stroke="#13c2c2" 
                            name="B回路电压(V)"
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col span={24}>
                    <Card title="温度趋势" className="chart-card">
                      <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="time" />
                          <YAxis />
                          <RechartsTooltip />
                          <Legend />
                          <Area 
                            type="monotone" 
                            dataKey="tempA" 
                            stroke="#eb2f96" 
                            fill="#eb2f96"
                            name="A回路温度(°C)"
                            fillOpacity={0.3}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="tempB" 
                            stroke="#f759ab" 
                            fill="#f759ab"
                            name="B回路温度(°C)"
                            fillOpacity={0.3}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </Card>
                  </Col>
                </Row>
              </div>
            )
          },
          {
            key: 'parameters',
            label: '详细参数',
            children: (
              <div className="parameters-content">
                <Row gutter={16}>
                  <Col span={12}>
                    <Card title="A回路详细参数" className="params-card">
                      <Descriptions column={1} size="small" bordered>
                        <Descriptions.Item label="电压 (V)">{cabinet.circuitA.voltage}</Descriptions.Item>
                        <Descriptions.Item label="电流 (A)">{cabinet.circuitA.current}</Descriptions.Item>
                        <Descriptions.Item label="功率 (kW)">{cabinet.circuitA.power}</Descriptions.Item>
                        <Descriptions.Item label="功率因数">{cabinet.circuitA.powerFactor}</Descriptions.Item>
                        <Descriptions.Item label="频率 (Hz)">{cabinet.circuitA.frequency}</Descriptions.Item>
                        <Descriptions.Item label="温度 (°C)">{cabinet.circuitA.temperature}</Descriptions.Item>
                        <Descriptions.Item label="累计能耗 (kWh)">{cabinet.circuitA.energy}</Descriptions.Item>
                        <Descriptions.Item label="状态">{getStatusText(cabinet.circuitA.status)}</Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </Col>

                  <Col span={12}>
                    <Card title="B回路详细参数" className="params-card">
                      <Descriptions column={1} size="small" bordered>
                        <Descriptions.Item label="电压 (V)">{cabinet.circuitB.voltage}</Descriptions.Item>
                        <Descriptions.Item label="电流 (A)">{cabinet.circuitB.current}</Descriptions.Item>
                        <Descriptions.Item label="功率 (kW)">{cabinet.circuitB.power}</Descriptions.Item>
                        <Descriptions.Item label="功率因数">{cabinet.circuitB.powerFactor}</Descriptions.Item>
                        <Descriptions.Item label="频率 (Hz)">{cabinet.circuitB.frequency}</Descriptions.Item>
                        <Descriptions.Item label="温度 (°C)">{cabinet.circuitB.temperature}</Descriptions.Item>
                        <Descriptions.Item label="累计能耗 (kWh)">{cabinet.circuitB.energy}</Descriptions.Item>
                        <Descriptions.Item label="状态">{getStatusText(cabinet.circuitB.status)}</Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </Col>
                </Row>

                <Card title="计算参数" className="calculated-params">
                  <Row gutter={16}>
                    <Col span={8}>
                      <Statistic
                        title="总视在功率 (kVA)"
                        value={(cabinet.total.power / Math.min(cabinet.circuitA.powerFactor, cabinet.circuitB.powerFactor)).toFixed(2)}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="平均功率因数"
                        value={((cabinet.circuitA.powerFactor + cabinet.circuitB.powerFactor) / 2).toFixed(3)}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="负载不平衡度 (%)"
                        value={(Math.abs(cabinet.circuitA.current - cabinet.circuitB.current) / Math.max(cabinet.circuitA.current, cabinet.circuitB.current) * 100).toFixed(1)}
                      />
                    </Col>
                  </Row>
                </Card>
              </div>
            )
          },
          {
            key: 'pdu',
            label: 'PDU数据',
            children: (
              <div className="pdu-content">
                {pduLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16 }}>
                      <Text type="secondary">正在加载PDU数据...</Text>
                    </div>
                  </div>
                ) : pduError ? (
                  <Alert
                    message="PDU数据加载失败"
                    description={pduError}
                    type="error"
                    showIcon
                  />
                ) : !pduData || (pduData.circuitA.ports.length === 0 && pduData.circuitB.ports.length === 0) ? (
                  <Empty description="该机柜暂无PDU数据" />
                ) : (
                  <>
                    {/* PDU端口列表 */}
                    <Card title="PDU端口列表" style={{ marginBottom: 16 }}>
                      <Table
                        dataSource={pduPorts}
                        rowKey="id"
                        size="small"
                        pagination={false}
                        onRow={(record) => ({
                          onClick: () => setSelectedPortId(record.id),
                          style: { 
                            cursor: 'pointer',
                            backgroundColor: selectedPortId === record.id ? '#e6f7ff' : 'transparent'
                          }
                        })}
                        columns={[
                          {
                            title: '端口标识',
                            dataIndex: 'port_identifier',
                            key: 'port_identifier',
                          },
                          {
                            title: '端口号',
                            dataIndex: 'port_number',
                            key: 'port_number',
                          },
                          {
                            title: 'PDU设备',
                            dataIndex: 'pdu_device_name',
                            key: 'pdu_device_name',
                          },
                          {
                            title: '状态',
                            dataIndex: 'status',
                            key: 'status',
                            render: (status) => (
                              <Badge 
                                status={status === 'active' ? 'success' : 'default'} 
                                text={status === 'active' ? '启用' : '停用'} 
                              />
                            )
                          }
                        ]}
                      />
                    </Card>

                    {/* 当前数据展示 */}
                    {pduTransformedData && (
                      <Card title="当前PDU数据" style={{ marginBottom: 16 }}>
                        <Row gutter={16}>
                          <Col span={12}>
                            <Card size="small" title="A路电源">
                              <Row gutter={[8, 8]}>
                                <Col span={12}>
                                  <Statistic
                                    title="电流"
                                    value={pduTransformedData.circuitA.current}
                                    suffix="A"
                                    precision={2}
                                  />
                                </Col>
                                <Col span={12}>
                                  <Statistic
                                    title="功率"
                                    value={pduTransformedData.circuitA.power}
                                    suffix="W"
                                    precision={2}
                                  />
                                </Col>
                                <Col span={12}>
                                  <Statistic
                                    title="电能"
                                    value={pduTransformedData.circuitA.energy}
                                    suffix="kWh"
                                    precision={2}
                                  />
                                </Col>
                                <Col span={12}>
                                  <Badge 
                                    status={pduTransformedData.circuitA.status === 'normal' ? 'success' : 'warning'} 
                                    text={getStatusText(pduTransformedData.circuitA.status)} 
                                  />
                                </Col>
                              </Row>
                            </Card>
                          </Col>
                          <Col span={12}>
                            <Card size="small" title="B路电源">
                              <Row gutter={[8, 8]}>
                                <Col span={12}>
                                  <Statistic
                                    title="电流"
                                    value={pduTransformedData.circuitB.current}
                                    suffix="A"
                                    precision={2}
                                  />
                                </Col>
                                <Col span={12}>
                                  <Statistic
                                    title="功率"
                                    value={pduTransformedData.circuitB.power}
                                    suffix="W"
                                    precision={2}
                                  />
                                </Col>
                                <Col span={12}>
                                  <Statistic
                                    title="电能"
                                    value={pduTransformedData.circuitB.energy}
                                    suffix="kWh"
                                    precision={2}
                                  />
                                </Col>
                                <Col span={12}>
                                  <Badge 
                                    status={pduTransformedData.circuitB.status === 'normal' ? 'success' : 'warning'} 
                                    text={getStatusText(pduTransformedData.circuitB.status)} 
                                  />
                                </Col>
                              </Row>
                            </Card>
                          </Col>
                        </Row>
                      </Card>
                    )}

                    {/* 历史数据图表 */}
                    {selectedPortId && (
                      <Card 
                        title="历史数据趋势"
                        extra={
                          <Select
                            value={historyDataType}
                            onChange={setHistoryDataType}
                            style={{ width: 120 }}
                            size="small"
                          >
                            <Option value="current">电流</Option>
                            <Option value="power">功率</Option>
                            <Option value="energy">电能</Option>
                            <Option value="thd_current">谐波</Option>
                          </Select>
                        }
                      >
                        {historyLoading ? (
                          <div style={{ textAlign: 'center', padding: '40px 0' }}>
                            <Spin />
                          </div>
                        ) : chartHistoryData.length === 0 ? (
                          <Empty description="暂无历史数据" />
                        ) : (
                          <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={chartHistoryData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="time" />
                              <YAxis />
                              <RechartsTooltip />
                              <Legend />
                              <Line 
                                type="monotone" 
                                dataKey="value" 
                                stroke="#1890ff" 
                                name={`${historyDataType === 'current' ? '电流' : historyDataType === 'power' ? '功率' : historyDataType === 'energy' ? '电能' : '谐波'} (${chartHistoryData[0]?.unit || ''})`}
                                strokeWidth={2}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </Card>
                    )}
                  </>
                )}
              </div>
            )
          }
        ]}
      />
    </Modal>
  );
};

export default CabinetDetailModal;
