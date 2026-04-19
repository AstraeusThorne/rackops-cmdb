import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Drawer, Spin, message } from 'antd';
import { 
  CloudServerOutlined, 
  ThunderboltOutlined, 
  DashboardOutlined, 
  WarningOutlined,
  AppstoreOutlined
} from '@ant-design/icons';
import { roomAPI } from '../../api';
import { pduDataAPI, pduPortAPI } from '../../api/pduAPI';
import { extractArrayFromResponse } from '../../utils/pduDataTransform';
import CabinetDetail from './components/CabinetDetail';
import CabinetNode from './components/CabinetNode';
import StatCard from './components/StatCard';
import './Dashboard.css';

/**
 * 数据仪表板 - 完全按照参考项目样式重新设计
 */
const Dashboard = () => {
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedCabinet, setSelectedCabinet] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [cabinetDetailVisible, setCabinetDetailVisible] = useState(false);
  const [cabinetPowerData, setCabinetPowerData] = useState({}); // 存储每个机柜的功率数据 { cabinetId: power }
  const [cabinetStatusData, setCabinetStatusData] = useState({}); // 存储每个机柜的状态数据 { cabinetId: { current, status } }

  // 获取机房的PDU功率数据（使用批量查询优化）
  const fetchRoomPowerData = useCallback(async (roomId, cabinets = null) => {
    try {
      // 如果提供了机柜列表，直接使用；否则从rooms状态中查找
      let roomCabinets = cabinets;
      if (!roomCabinets) {
        const room = rooms.find(r => r.id === roomId);
        if (!room || !room.cabinets) {
          setCabinetPowerData({});
          setCabinetStatusData({});
          return;
        }
        roomCabinets = room.cabinets;
      }

      if (!roomCabinets || roomCabinets.length === 0) {
        setCabinetPowerData({});
        setCabinetStatusData({});
        return;
      }

      // 提取所有机柜ID
      const cabinetIds = roomCabinets.map(cab => cab.cabinetId).filter(id => id != null);
      
      if (cabinetIds.length === 0) {
        setCabinetPowerData({});
        setCabinetStatusData({});
        return;
      }

      // 使用批量查询API一次性获取所有机柜的功率数据、电流数据和开关状态
      try {
        // 并行获取端口、功率数据、电流数据和开关状态
        const [portsResponse, powerResponse, currentResponse, switchStatusResponse] = await Promise.all([
          pduPortAPI.getBatchPortsByCabinets(cabinetIds, true), // 获取端口映射
          pduDataAPI.getBatchLatestByCabinets(cabinetIds, 'power', true),
          pduDataAPI.getBatchLatestByCabinets(cabinetIds, 'current', false), // 获取详细数据以计算状态
          pduDataAPI.getBatchLatestByCabinets(cabinetIds, 'switch_status', false) // 获取开关状态以判断是否离线
        ]);
        
        const batchPortsData = portsResponse.data || {};
        const batchPowerData = powerResponse.data || {};
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
        
        // 转换为对象格式 { cabinetId: power }
        const powerMap = {};
        const statusMap = {};
        
        roomCabinets.forEach(cabinet => {
          const cabinetKey = `cabinet_${cabinet.cabinetId}`;
          const cabinetPowerData = batchPowerData[cabinetKey];
          
          if (cabinetPowerData && cabinetPowerData.total_value !== undefined) {
            powerMap[cabinet.cabinetId] = cabinetPowerData.total_value;
          } else {
            powerMap[cabinet.cabinetId] = 0;
          }
          
          // 处理电流数据以计算状态
          // 从详细数据中提取该机柜的电流数据
          const cabinetCurrentData = batchCurrentData.filter(item => {
            // pdu_port在序列化器中是ID（数字）
            const portId = item.pdu_port;
            if (!portId) return false;
            return portToCabinetMap[portId] === cabinet.cabinetId;
          });
          
          // 处理开关状态数据
          const cabinetSwitchStatusData = batchSwitchStatusData.filter(item => {
            const portId = item.pdu_port;
            if (!portId) return false;
            return portToCabinetMap[portId] === cabinet.cabinetId;
          });
          
          // 计算2路总电流（所有端口的电流总和）
          let totalCurrent = 0;
          if (cabinetCurrentData.length > 0) {
            const currents = cabinetCurrentData
              .map(item => parseFloat(item.value) || 0)
              .filter(c => c > 0);
            if (currents.length > 0) {
              totalCurrent = currents.reduce((sum, c) => sum + c, 0);
            }
          }
          
          // 判断开关状态：优先使用开关状态来判断是否离线
          let switchStatus = null; // null表示没有开关状态数据
          if (cabinetSwitchStatusData.length > 0) {
            // 检查所有端口的开关状态，如果所有端口都是关闭（0），则判断为离线
            const switchValues = cabinetSwitchStatusData.map(item => {
              const value = item.value;
              // 处理各种可能的格式：数字1、字符串"1"、Decimal "1.0000"等
              const numValue = parseFloat(value);
              if (!isNaN(numValue)) {
                // 如果解析后的数字等于1（或接近1，考虑浮点数精度），则认为是开启
                if (numValue === 1 || Math.abs(numValue - 1) < 0.0001) {
                  return 1; // 开启
                }
                return 0; // 关闭
              }
              // 也检查字符串格式
              const strValue = String(value).trim().toLowerCase();
              if (strValue === '1' || strValue === 'true' || strValue === 'on' || strValue === 'yes') {
                return 1; // 开启
              }
              return 0; // 关闭
            });
            
            // 如果所有端口都是关闭状态，则switchStatus为0；否则为1（至少有一个开启）
            switchStatus = switchValues.every(v => v === 0) ? 0 : 1;
          }
          
          // 确定状态：优先使用开关状态，如果开关状态为关闭（0），则直接判断为离线
          let status = 'OFFLINE';
          if (switchStatus !== null) {
            // 有开关状态数据
            if (switchStatus === 0) {
              // 开关状态为关闭，直接判断为离线
              status = 'OFFLINE';
            } else {
              // 开关状态为开启，根据电流值判断其他状态
              // 2路总电流超过20A为严重，超过10A为告警
              if (totalCurrent > 0) {
                if (totalCurrent >= 20) {
                  status = 'CRITICAL';
                } else if (totalCurrent >= 10) {
                  status = 'WARNING';
                } else {
                  status = 'NORMAL';
                }
              } else {
                // 开关开启但电流为0，可能是刚启动或负载很小，判断为正常
                status = 'NORMAL';
              }
            }
          } else {
            // 没有开关状态数据，回退到使用电流值判断（兼容旧逻辑）
            // 2路总电流超过20A为严重，超过10A为告警
            if (totalCurrent > 0) {
              if (totalCurrent >= 20) {
                status = 'CRITICAL';
              } else if (totalCurrent >= 10) {
                status = 'WARNING';
              } else {
                status = 'NORMAL';
              }
            } else {
              status = 'OFFLINE';
            }
          }
          
          statusMap[cabinet.cabinetId] = {
            current: totalCurrent,
            status: status,
            switchStatus: switchStatus // 保存开关状态，方便调试
          };
        });
        
        setCabinetPowerData(powerMap);
        setCabinetStatusData(statusMap);
      } catch (batchError) {
        console.error('Error fetching batch power data, falling back to individual requests:', batchError);
        
        // 如果批量查询失败，回退到逐个查询（兼容性处理）
        const cabinetPromises = roomCabinets.map(async (cabinet) => {
          try {
            // 并行获取功率、电流和开关状态数据
            const [powerResponse, currentResponse, switchStatusResponse] = await Promise.all([
              pduDataAPI.getCabinetPDUData(cabinet.cabinetId, 'power'),
              pduDataAPI.getCabinetPDUData(cabinet.cabinetId, 'current'),
              pduDataAPI.getCabinetPDUData(cabinet.cabinetId, 'switch_status')
            ]);
            
            const powerData = extractArrayFromResponse(powerResponse, 'data');
            const currentData = extractArrayFromResponse(currentResponse, 'data');
            const switchStatusData = extractArrayFromResponse(switchStatusResponse, 'data');
            
            // 计算总功率
            const totalPower = powerData.reduce((sum, item) => {
              const powerValue = parseFloat(item.value) || 0;
              const powerInW = item.unit === 'kW' ? powerValue * 1000 : powerValue;
              return sum + powerInW;
            }, 0);
            
            // 计算2路总电流（所有端口的电流总和）
            let totalCurrent = 0;
            if (currentData.length > 0) {
              const currents = currentData
                .map(item => parseFloat(item.value) || 0)
                .filter(c => c > 0);
              if (currents.length > 0) {
                totalCurrent = currents.reduce((sum, c) => sum + c, 0);
              }
            }
            
            // 判断开关状态
            let switchStatus = null;
            if (switchStatusData.length > 0) {
              const switchValues = switchStatusData.map(item => {
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
            
            // 确定状态：优先使用开关状态
            // 2路总电流超过20A为严重，超过10A为告警
            let status = 'OFFLINE';
            if (switchStatus !== null) {
              if (switchStatus === 0) {
                status = 'OFFLINE';
              } else {
                if (totalCurrent > 0) {
                  if (totalCurrent >= 20) {
                    status = 'CRITICAL';
                  } else if (totalCurrent >= 10) {
                    status = 'WARNING';
                  } else {
                    status = 'NORMAL';
                  }
                } else {
                  status = 'NORMAL';
                }
              }
            } else {
              // 没有开关状态数据，使用电流值判断
              // 2路总电流超过20A为严重，超过10A为告警
              if (totalCurrent > 0) {
                if (totalCurrent >= 20) {
                  status = 'CRITICAL';
                } else if (totalCurrent >= 10) {
                  status = 'WARNING';
                } else {
                  status = 'NORMAL';
                }
              } else {
                status = 'OFFLINE';
              }
            }
            
            return {
              cabinetId: cabinet.cabinetId,
              power: totalPower,
              status: {
                current: totalCurrent,
                status: status,
                switchStatus: switchStatus
              }
            };
          } catch (error) {
            console.error(`Error fetching data for cabinet ${cabinet.cabinetId}:`, error);
            return {
              cabinetId: cabinet.cabinetId,
              power: 0,
              status: {
                current: 0,
                status: 'OFFLINE',
                switchStatus: null
              }
            };
          }
        });

        const results = await Promise.all(cabinetPromises);
        const powerMap = {};
        const statusMap = {};
        results.forEach(({ cabinetId, power, status }) => {
          powerMap[cabinetId] = power;
          statusMap[cabinetId] = status;
        });
        
        setCabinetPowerData(powerMap);
        setCabinetStatusData(statusMap);
      }
    } catch (error) {
      console.error('Error fetching room power data:', error);
      setCabinetPowerData({});
      setCabinetStatusData({});
    }
  }, [rooms]);

  // 获取指定机房的机柜
  const fetchRoomCabinets = useCallback(async (roomId) => {
    try {
      setRooms(prevRooms => {
        const room = prevRooms.find(r => r.id === roomId);
        if (!room) return prevRooms;

        // 这里需要异步获取机柜数据，所以我们需要在外部处理
        return prevRooms;
      });

      // 获取机柜数据（与 F1D/F1B 一致，按 room_id 聚合）
      const cabinetsResponse = await roomAPI.getRoomCabinetsWithStats(roomId);
      const cabinetsData = cabinetsResponse.data || [];
      const list = Array.isArray(cabinetsData) ? cabinetsData : [];

      setRooms(prevRooms => {
        const room = prevRooms.find(r => r.id === roomId);
        if (!room) return prevRooms;

        // 为仪表板机柜计算行列坐标，并按行优先排序（01-01 在最前）
        const withPosition = list.map((cab, index) => {
          const parts = (cab.name || '').split('-');
          const rowStr = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || '01');
          const colStr = parts.length >= 2 ? parts[parts.length - 1] : (parts[0] || '01');
          const row = (parseInt(rowStr, 10) || 1) - 1;
          const col = (parseInt(colStr, 10) || 1) - 1;
          return {
            id: cab.id,
            index,
            name: cab.name,
            room_name: cab.room_name,
            cabinetId: cab.id,
            row,
            col,
          };
        });
        const formattedCabinets = [...withPosition].sort((a, b) => {
          if (a.row !== b.row) return a.row - b.row;
          return a.col - b.col;
        });

        const updatedRooms = prevRooms.map(r => {
          if (r.id === roomId) {
            return {
              ...r,
              cabinets: formattedCabinets
            };
          }
          return r;
        });

        // 机柜列表更新后，立即获取功率数据
        if (formattedCabinets.length > 0) {
          fetchRoomPowerData(roomId, formattedCabinets);
        }

        return updatedRooms;
      });
    } catch (error) {
      console.error('Error fetching cabinets:', error);
    }
  }, [fetchRoomPowerData]);

  // 获取机房列表
  const fetchRooms = useCallback(async () => {
    try {
      setLoading(true);
      const response = await roomAPI.getRooms();
      const roomsData = response.data?.results || response.data || [];

      // 并行获取每个机房的机柜列表（与 F1D/F1B 使用的接口一致）
      const roomList = Array.isArray(roomsData) ? roomsData : [];
      const cabinetsResponses = await Promise.all(
        roomList.map((room) => roomAPI.getRoomCabinetsWithStats(room.id))
      );

      const formattedRooms = roomList.map((room, idx) => {
        const cabinetsData = cabinetsResponses[idx]?.data || [];
        const list = Array.isArray(cabinetsData) ? cabinetsData : [];

        const withPosition = list.map((cab, index) => {
          const parts = (cab.name || '').split('-');
          const rowStr = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || '01');
          const colStr = parts.length >= 2 ? parts[parts.length - 1] : (parts[0] || '01');
          const row = (parseInt(rowStr, 10) || 1) - 1;
          const col = (parseInt(colStr, 10) || 1) - 1;
          return {
            id: cab.id,
            index,
            name: cab.name,
            room_name: cab.room_name,
            cabinetId: cab.id,
            row,
            col,
          };
        });
        const sortedCabinets = [...withPosition].sort((a, b) => {
          if (a.row !== b.row) return a.row - b.row;
          return a.col - b.col;
        });

        return {
          id: room.id,
          name: room.name,
          cabinets: sortedCabinets,
        };
      });

      setRooms(formattedRooms);
      if (formattedRooms.length > 0) {
        setSelectedRoomId((prevRoomId) => prevRoomId || formattedRooms[0].id);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
      message.error('获取机房数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始化数据
  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // 自动刷新数据
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedRoomId) {
        fetchRoomCabinets(selectedRoomId);
        fetchRoomPowerData(selectedRoomId);
      }
      setLastUpdated(new Date());
    }, 5 * 60 * 1000); // 每5分钟刷新一次

    return () => clearInterval(interval);
  }, [selectedRoomId, fetchRoomCabinets, fetchRoomPowerData]);

  // 当前选中的机房
  const currentRoom = useMemo(() => 
    rooms.find(r => r.id === selectedRoomId), 
    [rooms, selectedRoomId]
  );

  // 当选中机房或机柜列表变化时，获取功率数据
  useEffect(() => {
    if (selectedRoomId && currentRoom && currentRoom.cabinets && currentRoom.cabinets.length > 0) {
      fetchRoomPowerData(selectedRoomId, currentRoom.cabinets);
    }
  }, [selectedRoomId, currentRoom, fetchRoomPowerData]);

  // 计算统计数据
  const stats = useMemo(() => {
    if (!currentRoom || !currentRoom.cabinets || currentRoom.cabinets.length === 0) {
      return { totalPower: 0, critical: 0, warning: 0, avgLoad: 0 };
    }
    
    // 从PDU数据中计算总功率
    const totalPower = currentRoom.cabinets.reduce((sum, cabinet) => {
      const power = cabinetPowerData[cabinet.cabinetId] || 0;
      return sum + power;
    }, 0);
    
    // 计算平均负载（总功率除以机柜数量）
    const avgLoad = currentRoom.cabinets.length > 0 
      ? totalPower / currentRoom.cabinets.length 
      : 0;
    
    // 根据功率数据计算告警数量（可以根据实际需求调整阈值）
    // 这里暂时设置为0，后续可以根据PDU数据中的告警状态来计算
    const critical = 0;
    const warning = 0;
    
    return { totalPower, critical, warning, avgLoad };
  }, [currentRoom, cabinetPowerData]);

  // 处理机柜点击
  const handleCabinetClick = (cabinet) => {
    setSelectedCabinet(cabinet);
    setCabinetDetailVisible(true);
  };

  // 处理关闭详情
  const handleCloseDetail = () => {
    setCabinetDetailVisible(false);
    setSelectedCabinet(null);
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#94a3b8' }}>加载中...</div>
      </div>
    );
  }

  if (!currentRoom) {
    return (
      <div className="dashboard-empty">
        <div style={{ color: '#94a3b8' }}>暂无机房数据</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* 侧边栏导航 */}
      <div className="dashboard-sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">
            <CloudServerOutlined className="sidebar-icon" />
            DC Sentinel
          </h1>
          <p className="sidebar-subtitle">机房弱电监控系统 v2.0</p>
        </div>

        <nav className="sidebar-nav">
          {rooms.map(room => {
            const hasCritical = false; // 需要根据PDU数据判断
            return (
              <button
                key={room.id}
                onClick={() => setSelectedRoomId(room.id)}
                className={`sidebar-nav-item ${selectedRoomId === room.id ? 'active' : ''}`}
              >
                <AppstoreOutlined className="nav-icon" />
                <div className="nav-content">
                  <div className="nav-name">{room.name}</div>
                  <div className="nav-count">{room.cabinets.length} Cabinets</div>
                </div>
                {hasCritical && <span className="nav-alert-dot" />}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="system-status">System Status: ONLINE</div>
          <div className="last-update">Last Update: {lastUpdated.toLocaleTimeString()}</div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="dashboard-main">
        {/* 顶部头部和统计 */}
        <header className="dashboard-header">
          <div className="header-title">
            <h2>{currentRoom.name} 概览</h2>
          </div>
          
          <div className="header-stats">
            <StatCard 
              label="总功率 Load" 
              value={`${(stats.totalPower / 1000).toFixed(1)} kW`} 
              icon={<ThunderboltOutlined />}
              iconColor="#fbbf24"
            />
            <StatCard 
              label="平均负载 Avg" 
              value={`${Math.round(stats.avgLoad)} W`} 
              icon={<DashboardOutlined />}
              iconColor="#60a5fa"
            />
            <StatCard 
              label="严重告警 Critical" 
              value={stats.critical.toString()} 
              alert={stats.critical > 0}
              icon={<WarningOutlined />}
              iconColor={stats.critical > 0 ? "#f87171" : "#64748b"}
            />
          </div>
        </header>

        {/* 工作区：机柜网格 */}
        <div className="dashboard-workspace">
          <div className="cabinet-grid-container">
            <div className="grid-legend">
              <span className="legend-item">
                <span className="legend-dot normal" />
                正常
              </span>
              <span className="legend-item">
                <span className="legend-dot warning" />
                告警
              </span>
              <span className="legend-item">
                <span className="legend-dot critical" />
                严重
              </span>
              <span className="legend-item">
                <span className="legend-dot offline" />
                离线
              </span>
            </div>

            <div className="cabinet-grid">
              {currentRoom.cabinets.map((cabinet) => (
                <CabinetNode
                  key={cabinet.id}
                  cabinet={cabinet}
                  onClick={() => handleCabinetClick(cabinet)}
                  isSelected={selectedCabinet?.id === cabinet.id}
                  statusData={cabinetStatusData[cabinet.cabinetId]} // 传递状态数据，避免单独查询
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 机柜详情侧边栏 */}
      <Drawer
        title={null}
        placement="right"
        onClose={handleCloseDetail}
        open={cabinetDetailVisible}
        width={384}
        className="cabinet-detail-drawer"
        closable={false}
      >
        {selectedCabinet && (
          <CabinetDetail 
            cabinet={selectedCabinet} 
            onClose={handleCloseDetail} 
          />
        )}
      </Drawer>
    </div>
  );
};

export default Dashboard;
