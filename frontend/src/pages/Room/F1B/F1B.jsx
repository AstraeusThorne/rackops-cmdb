import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Spin, message, Tooltip, Input, Select, Row, Col } from 'antd';
import { useNavigate } from 'react-router-dom';
import { SearchOutlined } from '@ant-design/icons';
import { roomAPI } from '../../../api';
import { pduDataAPI, pduPortAPI } from '../../../api/pduAPI';
import { useConfig } from '../../../contexts/ConfigContext';
import styles from './F1B.module.css';

const { Option } = Select;

/**
 * F1B机房页面组件
 */
const F1B = () => {
  const { getAlertThresholds } = useConfig();
  const alertThresholds = getAlertThresholds();
  
  const navigate = useNavigate();
  const [roomData, setRoomData] = useState(null);
  const [cabinets, setCabinets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState(''); // 搜索文本
  const [filterStatus, setFilterStatus] = useState('all'); // 过滤状态
  const [cabinetStatusData, setCabinetStatusData] = useState({}); // 存储每个机柜的PDU状态数据 { cabinetId: { current, status } }

  // 获取机柜PDU状态数据
  const fetchCabinetPDUStatus = useCallback(async (cabinetIds) => {
    try {
      if (!cabinetIds || cabinetIds.length === 0) {
        setCabinetStatusData({});
        return;
      }

      // 并行获取端口、电流数据和开关状态
      const [portsResponse, currentResponse, switchStatusResponse] = await Promise.all([
        pduPortAPI.getBatchPortsByCabinets(cabinetIds, true),
        pduDataAPI.getBatchLatestByCabinets(cabinetIds, 'current', false),
        pduDataAPI.getBatchLatestByCabinets(cabinetIds, 'switch_status', false)
      ]);

      const batchPortsData = portsResponse.data || {};
      const batchCurrentData = currentResponse.data || [];
      const batchSwitchStatusData = switchStatusResponse.data || [];

      // 建立端口ID到机柜ID的映射
      const portToCabinetMap = {};
      Object.entries(batchPortsData).forEach(([cabinetKey, ports]) => {
        const cabinetId = parseInt(cabinetKey.replace('cabinet_', ''));
        if (Array.isArray(ports)) {
          ports.forEach(port => {
            portToCabinetMap[port.id] = cabinetId;
          });
        }
      });

      // 计算每个机柜的状态
      const statusMap = {};
      cabinetIds.forEach(cabinetId => {
        const cabinetCurrentData = batchCurrentData.filter(item => {
          const portId = item.pdu_port;
          if (!portId) return false;
          return portToCabinetMap[portId] === cabinetId;
        });

        const cabinetSwitchStatusData = batchSwitchStatusData.filter(item => {
          const portId = item.pdu_port;
          if (!portId) return false;
          return portToCabinetMap[portId] === cabinetId;
        });

        let totalCurrent = 0;
        if (cabinetCurrentData.length > 0) {
          const currents = cabinetCurrentData
            .map(item => parseFloat(item.value) || 0)
            .filter(c => c > 0);
          if (currents.length > 0) {
            totalCurrent = currents.reduce((sum, c) => sum + c, 0);
          }
        }

        let switchStatus = null;
        if (cabinetSwitchStatusData.length > 0) {
          const switchValues = cabinetSwitchStatusData.map(item => {
            const value = item.value;
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              if (numValue === 1 || Math.abs(numValue - 1) < 0.0001) {
                return 1;
              }
              return 0;
            }
            const strValue = String(value).trim().toLowerCase();
            if (strValue === '1' || strValue === 'true' || strValue === 'on' || strValue === 'yes') {
              return 1;
            }
            return 0;
          });
          switchStatus = switchValues.every(v => v === 0) ? 0 : 1;
        }

        const currentCritical = alertThresholds?.current?.critical || 20;
        const currentWarning = alertThresholds?.current?.warning || 10;

        let status = 'OFFLINE';
        if (switchStatus !== null) {
          if (switchStatus === 0) {
            status = 'OFFLINE';
          } else if (totalCurrent > 0) {
            if (totalCurrent >= currentCritical) {
              status = 'CRITICAL';
            } else if (totalCurrent >= currentWarning) {
              status = 'WARNING';
            } else {
              status = 'NORMAL';
            }
          } else {
            status = 'NORMAL';
          }
        } else if (totalCurrent > 0) {
          if (totalCurrent >= currentCritical) {
            status = 'CRITICAL';
          } else if (totalCurrent >= currentWarning) {
            status = 'WARNING';
          } else {
            status = 'NORMAL';
          }
        } else {
          status = 'OFFLINE';
        }

        statusMap[cabinetId] = {
          current: totalCurrent,
          status: status,
          switchStatus: switchStatus
        };
      });

      setCabinetStatusData(statusMap);
    } catch (error) {
      console.error('Error fetching PDU status data:', error);
      setCabinetStatusData({});
    }
  }, [alertThresholds]);

  // 加载机房数据：一次请求获取机房 + 机柜及设备数，再异步拉取 PDU 状态
  useEffect(() => {
    const fetchRoomData = async () => {
      try {
        setLoading(true);
        const roomId = 2;
        const [roomResponse, cabinetsResponse] = await Promise.all([
          roomAPI.getRoom(roomId),
          roomAPI.getRoomCabinetsWithStats(roomId)
        ]);

        setRoomData(roomResponse.data);

        const cabinetsData = cabinetsResponse.data || [];
        const list = Array.isArray(cabinetsData) ? cabinetsData : [];

        // 为机柜添加 row/col 属性（根据名称解析布局位置）
        const cabinetsWithPosition = list.map((cabinet) => {
          const parts = (cabinet.name || '').split('-');
          const rowStr = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || '01');
          const colStr = parts.length >= 2 ? parts[parts.length - 1] : (parts[0] || '01');
          const row = (parseInt(rowStr, 10) || 1) - 1;
          const col = (parseInt(colStr, 10) || 1) - 1;
          return {
            ...cabinet,
            row,
            col,
            device_count: cabinet.device_count ?? 0
          };
        });

        const sortedCabinets = [...cabinetsWithPosition].sort((a, b) => {
          if (a.row !== b.row) return a.row - b.row;
          return a.col - b.col;
        });

        setCabinets(sortedCabinets);

        if (sortedCabinets.length > 0) {
          fetchCabinetPDUStatus(sortedCabinets.map((c) => c.id));
        }
      } catch (error) {
        console.error('Error fetching room data:', error);
        message.error('获取机房数据失败');
      } finally {
        setLoading(false);
      }
    };

    fetchRoomData();
  }, [fetchCabinetPDUStatus]);

  // 过滤和搜索机柜数据
  const filteredCabinets = useMemo(() => {
    let filtered = cabinets;

    // 搜索过滤
    if (searchText) {
      filtered = filtered.filter(cabinet =>
        cabinet.name.toLowerCase().includes(searchText.toLowerCase()) ||
        cabinet.location?.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    // 状态过滤
    if (filterStatus !== 'all') {
      filtered = filtered.filter(cabinet => {
        const deviceCount = cabinet.device_count || 0;
        switch (filterStatus) {
          case 'empty':
            return deviceCount === 0;
          case 'occupied':
            return deviceCount > 0;
          case 'full':
            return deviceCount >= (cabinet.capacity || 42); // 假设标准机柜容量为42U
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [cabinets, searchText, filterStatus]);

  // 处理点击机柜事件
  const handleCabinetClick = (cabinet) => {
    if (cabinet) {
      navigate(`/cabinet/${cabinet.id}`);
    }
  };

  // 获取机柜状态圆点（基于PDU电流数据）
  const getCabinetStatusDot = (cabinet) => {
    const statusData = cabinetStatusData[cabinet.id];
    
    if (!statusData) {
      // 没有PDU数据，显示为灰色（离线）
      return <div className={`${styles.statusDot} ${styles.offline}`} />;
    }

    const status = statusData.status;
    switch (status) {
      case 'CRITICAL':
        return <div className={`${styles.statusDot} ${styles.critical}`} />;
      case 'WARNING':
        return <div className={`${styles.statusDot} ${styles.warning}`} />;
      case 'NORMAL':
        return <div className={`${styles.statusDot} ${styles.normal}`} />;
      case 'OFFLINE':
      default:
        return <div className={`${styles.statusDot} ${styles.offline}`} />;
    }
  };

  // 渲染搜索和过滤控件
  const renderSearchAndFilters = () => (
    <div className={styles.searchFilterSection}>
      <div className={styles.searchFilterContent}>
        <div className={styles.searchBox}>
          <Input
            placeholder="搜索机柜编号..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            size="middle"
          />
        </div>
        <div className={styles.filterBox}>
          <Select
            value={filterStatus}
            onChange={setFilterStatus}
            placeholder="筛选状态"
            size="middle"
          >
            <Option value="all">全部状态</Option>
            <Option value="empty">空闲</Option>
            <Option value="used">已使用</Option>
            <Option value="full">满载</Option>
          </Select>
        </div>
      </div>
    </div>
  );

  // 渲染列表视图
  const renderListView = () => (
    <div className={styles.listView}>
      <div className={styles.cabinetListContainer}>
          <Row gutter={[8, 0]}>
            {filteredCabinets.map((cabinet) => {
              const deviceCount = cabinet.device_count || 0;
              const capacity = cabinet.capacity || 42;
              const usage = Math.round((deviceCount / capacity) * 100);
              const statusData = cabinetStatusData[cabinet.id];
              const totalCurrent = statusData?.current || 0;
              const status = statusData?.status || 'OFFLINE';
              
              const statusText = {
                'CRITICAL': '严重告警 (红点)',
                'WARNING': '告警 (橙点)',
                'NORMAL': '正常 (绿点)',
                'OFFLINE': '离线 (灰点)'
              }[status] || '离线 (灰点)';

              return (
                <Col key={cabinet.id} xs={12} sm={8} md={6} lg={4} xl={3}>
                  <Tooltip
                    title={
                      <div>
                        <div><strong>{cabinet.name}</strong></div>
                        <div>位置: {cabinet.location || `${cabinet.row + 1}-${cabinet.col + 1}`}</div>
                        <div>设备数量: {deviceCount}台</div>
                        <div>容量: {capacity}U</div>
                        <div>使用率: {usage}%</div>
                        {statusData ? (
                          <>
                            <div>2路总电流: {totalCurrent.toFixed(2)}A</div>
                            <div>状态: {statusText}</div>
                          </>
                        ) : (
                          <div>状态: 离线 (灰点) - 无PDU数据</div>
                        )}
                        <div>点击查看详情</div>
                      </div>
                    }
                    placement="top"
                  >
                    <Card
                    className={styles.compactCabinetCard}
                    styles={{ body: { padding: '2px' } }}
                    onClick={() => handleCabinetClick(cabinet)}
                  >
                      <div className={styles.compactCabinetContent}>
                        <div className={styles.compactCabinetName}>{cabinet.name}</div>
                        <div className={styles.compactCabinetStatus}>
                          {getCabinetStatusDot(cabinet)}
                        </div>
                      </div>
                    </Card>
                  </Tooltip>
                </Col>
              );
            })}
          </Row>
        </div>
    </div>
  );



  // 渲染主要内容
  const renderContent = () => {
    if (loading) {
      return (
        <div className={styles.loadingContainer}>
          <Spin />
        </div>
      );
    }

    return renderListView();
  };

  return (
    <div className={styles.roomPage}>
      {/* 简化的页面头部 */}
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h2 className={styles.pageTitle}>F1B机房</h2>
          {roomData && (
            <div className={styles.roomStats}>
              <span className={styles.statItem}>
                <span className={styles.statLabel}>机柜总数</span>
                <span className={styles.statValue}>{cabinets.length}</span>
              </span>
              <span className={styles.statItem}>
                <span className={styles.statLabel}>使用中</span>
                <span className={styles.statValue}>{cabinets.filter(c => (c.device_count || 0) > 0).length}</span>
              </span>
              <span className={styles.statItem}>
                <span className={styles.statLabel}>空闲</span>
                <span className={styles.statValue}>{cabinets.filter(c => (c.device_count || 0) === 0).length}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className={styles.mainContent}>
        {renderSearchAndFilters()}
        {renderContent()}
      </div>
    </div>
  );
};

export default F1B;
