import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Row, Col, Badge, Button, message, Spin } from 'antd';
import { ArrowLeftOutlined, ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { cabinetAPI, deviceAPI } from '../../api';
import { useCabinetPDU } from '../../hooks/usePDU';
import styles from './Cabinet.module.css';

/**
 * 机柜详情组件
 */
const Cabinet = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [cabinetData, setCabinetData] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pduRefreshKey, setPduRefreshKey] = useState(0);
  
  // 生成U位数组，从42到1
  const rackUnits = useMemo(() => Array.from({ length: 42 }, (_, index) => 42 - index), []);

  // 获取机柜和设备数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        if (!id || isNaN(parseInt(id))) {
          message.error('无效的机柜ID');
          setLoading(false);
          return;
        }

        const cabinetIdNum = parseInt(id, 10);
        const [cabinetResponse, devicesResponse] = await Promise.all([
          cabinetAPI.getCabinet(id),
          deviceAPI.getDevices({ cabinet: cabinetIdNum, page_size: 200 })
        ]);

        setCabinetData(cabinetResponse.data);

        // 后端已按 cabinet 过滤，直接使用返回结果（避免默认分页只返回20条导致设备数量为0）
        const devicesData = devicesResponse.data.results || devicesResponse.data || [];
        const cabinetDevices = Array.isArray(devicesData) ? devicesData : [];
        setDevices(cabinetDevices);
      } catch (error) {
        console.error('Error fetching data:', error);
        message.error('获取数据失败');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchData();
    }
  }, [id]);

  // 根据U位获取对应的设备
  const getDeviceAtPosition = useCallback((position) => {
    return devices.find(device => parseInt(device.rack_position) === position);
  }, [devices]);

  // 检查是否是设备的起始位置
  const isDeviceStart = useCallback((position) => {
    return devices.some(device => parseInt(device.rack_position) === position);
  }, [devices]);

  // 获取机柜的PDU数据
  const { 
    data: pduData, 
    loading: pduLoading, 
    error: pduError,
    transformedData: pduTransformedData,
    refetch: refetchPDU
  } = useCabinetPDU(id, {
    cabinetInfo: {
      id: id,
      name: cabinetData?.name,
      location: '',
      room: cabinetData?.room_name
    }
  });

  // 判断开关是否开启的辅助函数
  const isSwitchOn = (value) => {
    if (value === undefined || value === null) {
      return false;
    }
    // 处理数字类型（包括1.0、1.0000等）
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && (numValue === 1 || Math.abs(numValue - 1) < 0.0001)) {
      return true; // 开启
    }
    // 处理字符串类型
    const strValue = String(value).trim().toLowerCase();
    if (strValue === '1' || strValue === 'true' || strValue === 'on' || strValue === 'yes') {
      return true; // 开启
    }
    // 其他情况都视为关闭
    return false;
  };

  // 刷新PDU数据
  const handleRefreshPDU = useCallback(() => {
    setPduRefreshKey(prev => prev + 1);
    refetchPDU();
    message.info('正在刷新PDU数据...');
  }, [refetchPDU]);

  // 返回上一级（根据机柜所在机房动态返回）
  const handleBack = () => {
    const roomName = cabinetData?.room_name || 'F1B';
    navigate(`/room/${roomName}`);
  };

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  if (!cabinetData) {
    return <div className={styles.error}>未找到机柜数据</div>;
  }

  return (
    <div className={styles.cabinetDetailContainer}>
      <div className={styles.pageHeader}>
        <Button 
          type="link" 
          icon={<ArrowLeftOutlined />} 
          onClick={handleBack}
          className={styles.backButton}
        >
          返回{cabinetData?.room_name || '机房'}
        </Button>
      </div>
      <Card title={
        <div className={styles.cabinetTitle}>
          <span className={styles.mainTitle}>机柜详情</span>
          <Badge status="success" text="运行正常" className={styles.cabinetStatus} />
        </div>
      } className={styles.cabinetCard}>
        <Row gutter={24}>
          <Col span={8}>
            <div className={styles.cabinetInfo}>
              <div className={styles.sectionTitle}>基本信息</div>
              <div className={styles.infoContent}>
                <div className={styles.infoItem}>
                  <span className={styles.label}>机柜编号：</span>
                  <span className={styles.value}>{cabinetData.name}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.label}>所在机房：</span>
                  <span className={styles.value}>{cabinetData.room_name}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.label}>设备数量：</span>
                  <span className={styles.value}>{devices.length}台</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.label}>空余U位：</span>
                  <span className={styles.value}>
                    {42 - devices.reduce((sum, device) => sum + (parseInt(device.u_size) || 1), 0)}U
                  </span>
                </div>
              </div>

              {/* 弱电信息 */}
              {pduLoading ? (
                <div style={{ marginTop: 24 }}>
                  <div className={styles.sectionTitle}>弱电信息</div>
                  <div className={styles.infoContent}>
                    <div className={styles.infoItem}>
                      <Spin size="small" /> <span style={{ marginLeft: 8 }}>加载中...</span>
                    </div>
                  </div>
                </div>
              ) : pduError ? (
                <div style={{ marginTop: 24 }}>
                  <div className={styles.sectionTitle}>弱电信息</div>
                  <div className={styles.infoContent}>
                    <div className={styles.infoItem}>
                      <span className={styles.label} style={{ color: '#ff4d4f' }}>数据加载失败</span>
                    </div>
                  </div>
                </div>
              ) : pduTransformedData ? (
                <div style={{ marginTop: 24 }}>
                  <div className={styles.sectionTitle}>
                    <ThunderboltOutlined style={{ marginRight: 8 }} />
                    弱电信息
                    <Button 
                      icon={<ReloadOutlined />} 
                      size="small"
                      type="text"
                      onClick={handleRefreshPDU}
                      loading={pduLoading}
                      style={{ marginLeft: 8, fontSize: '12px' }}
                    >
                      刷新
                    </Button>
                  </div>
                  <div className={styles.infoContent}>
                    {/* A路信息 */}
                    <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f0f0f0' }}>
                      <div style={{ fontWeight: 600, marginBottom: 8, color: '#1890ff' }}>A路电源</div>
                      <div className={styles.infoItem}>
                        <span className={styles.label}>电流：</span>
                        <span className={styles.value}>{(pduTransformedData.circuitA?.current || 0).toFixed(2)} A</span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.label}>功率：</span>
                        <span className={styles.value}>{(pduTransformedData.circuitA?.power || 0).toFixed(2)} W</span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.label}>电能：</span>
                        <span className={styles.value}>{(pduTransformedData.circuitA?.energy || 0).toFixed(2)} kWh</span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.label}>谐波失真：</span>
                        <span className={styles.value}>
                          {(pduTransformedData.circuitA?.thdCurrent || 0).toFixed(2)}%
                        </span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.label}>开关状态：</span>
                        <span className={styles.value} style={{ 
                          color: isSwitchOn(pduTransformedData.circuitA?.switchStatus) ? '#52c41a' : '#ff4d4f' 
                        }}>
                          {isSwitchOn(pduTransformedData.circuitA?.switchStatus) ? '开启' : '关闭'}
                        </span>
                      </div>
                    </div>

                    {/* B路信息 */}
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 8, color: '#1890ff' }}>B路电源</div>
                      <div className={styles.infoItem}>
                        <span className={styles.label}>电流：</span>
                        <span className={styles.value}>{(pduTransformedData.circuitB?.current || 0).toFixed(2)} A</span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.label}>功率：</span>
                        <span className={styles.value}>{(pduTransformedData.circuitB?.power || 0).toFixed(2)} W</span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.label}>电能：</span>
                        <span className={styles.value}>{(pduTransformedData.circuitB?.energy || 0).toFixed(2)} kWh</span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.label}>谐波失真：</span>
                        <span className={styles.value}>
                          {(pduTransformedData.circuitB?.thdCurrent || 0).toFixed(2)}%
                        </span>
                      </div>
                      <div className={styles.infoItem}>
                        <span className={styles.label}>开关状态：</span>
                        <span className={styles.value} style={{ 
                          color: isSwitchOn(pduTransformedData.circuitB?.switchStatus) ? '#52c41a' : '#ff4d4f' 
                        }}>
                          {isSwitchOn(pduTransformedData.circuitB?.switchStatus) ? '开启' : '关闭'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 24 }}>
                  <div className={styles.sectionTitle}>弱电信息</div>
                  <div className={styles.infoContent}>
                    <div className={styles.infoItem}>
                      <span className={styles.label} style={{ color: '#999' }}>暂无数据</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Col>
          <Col span={16}>
            <div className={styles.cabinetVisualization}>
              <div className={styles.sectionTitle}>机柜视图</div>
              <div className={styles.rackContainer}>
                <div className={styles.rackHeader}>
                  <div className={`${styles.headerCell} ${styles.uHeader}`}>U位</div>
                  <div className={`${styles.headerCell} ${styles.brandHeader}`}>品牌/型号</div>
                  <div className={`${styles.headerCell} ${styles.snHeader}`}>SN</div>
                  <div className={`${styles.headerCell} ${styles.powerHeader}`}>电源</div>
                </div>
                <div className={styles.rackBody}>
                  <div className={styles.uLabels}>
                    {rackUnits.map(u => (
                      <div key={u} className={styles.uLabel}>{u}U</div>
                    ))}
                  </div>
                  <div className={styles.rackUnits}>
                    {rackUnits.map(u => {
                      const device = getDeviceAtPosition(u);
                      const showDevice = isDeviceStart(u);

                      return (
                        <div 
                          key={u} 
                          className={styles.rackUnit}
                          style={{
                            top: `${(42 - (u + (device?.u_size || 1) - 1)) * 22}px`
                          }}
                        >
                          {device && showDevice && (
                            <div 
                              className={`${styles.rackUnit} ${styles.occupied}`}
                              style={{
                                height: `${(parseInt(device.u_size) || 1) * 22}px`,
                                top: 0
                              }}
                            >
                              <div className={styles.unitContent}>
                                <div className={`${styles.unitInfo} ${styles.brand}`}>{`${device.brand || '未知'} ${device.model || '未知'}`}</div>
                                <div className={`${styles.unitInfo} ${styles.sn}`}>{device.sn || '未知'}</div>
                                <div className={`${styles.unitInfo} ${styles.power}`}>{device.power_type === 'single' ? '单电源' : device.power_type === 'dual' ? '双电源' : '未知'}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </Col>
        </Row>
      </Card>

    </div>
  );
};

export default Cabinet;