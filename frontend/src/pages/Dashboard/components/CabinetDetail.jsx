import React, { useMemo, useState, useEffect } from 'react';
import { CloseOutlined, ThunderboltOutlined, LineChartOutlined } from '@ant-design/icons';
import { useCabinetPDU } from '../../../hooks/usePDU';
import { pduPortAPI, pduDataAPI } from '../../../api/pduAPI';
import { extractArrayFromResponse } from '../../../utils/pduDataTransform';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useConfig } from '../../../contexts/ConfigContext';
import './CabinetDetail.css';

/**
 * 机柜详情组件
 */
const CabinetDetail = ({ cabinet, onClose }) => {
  const { getAlertThresholds, getDisplaySettings } = useConfig();
  const alertThresholds = getAlertThresholds();
  const displaySettings = getDisplaySettings();
  const historyDays = displaySettings?.historyDataDays || 1;
  
  const { data: pduData, loading, transformedData } = useCabinetPDU(cabinet.cabinetId, {
    cabinetInfo: {
      id: cabinet.cabinetId,
      name: cabinet.name,
      room: cabinet.room_name
    }
  });

  // 状态颜色映射
  const statusColor = useMemo(() => {
    if (loading || (!transformedData && !pduData)) return 'text-slate-500';
    
    const dataSource = transformedData || pduData;
    const circuitA = dataSource.circuitA || {};
    const circuitB = dataSource.circuitB || {};
    // 计算2路总电流（A路 + B路）
    const totalCurrent = (circuitA.current || 0) + (circuitB.current || 0);
    
    // 使用配置的电流阈值
    const currentCritical = alertThresholds?.current?.critical || 20;
    const currentWarning = alertThresholds?.current?.warning || 10;
    
    if (totalCurrent >= currentCritical) return 'text-rose-500';
    if (totalCurrent >= currentWarning) return 'text-yellow-400';
    return 'text-emerald-400';
  }, [transformedData, pduData, loading, alertThresholds]);

  // 总电能
  const totalEnergy = useMemo(() => {
    if (!transformedData && !pduData) return 0;
    const dataSource = transformedData || pduData;
    const circuitA = dataSource.circuitA || {};
    const circuitB = dataSource.circuitB || {};
    return (circuitA.energy || 0) + (circuitB.energy || 0);
  }, [transformedData, pduData]);

  // 电流谐波失真（THD Current）- 取A路和B路的最大值
  const thdCurrent = useMemo(() => {
    if (!transformedData) return 0;
    const circuitA = transformedData.circuitA || {};
    const circuitB = transformedData.circuitB || {};
    const thdA = circuitA.thdCurrent || 0;
    const thdB = circuitB.thdCurrent || 0;
    return Math.max(thdA, thdB);
  }, [transformedData]);

  // 历史数据状态 - 分别存储A路和B路的数据
  const [historyDataA, setHistoryDataA] = useState([]);
  const [historyDataB, setHistoryDataB] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 判断端口是A路还是B路
  const getCircuitType = (port) => {
    if (!port || !port.pdu_device_name) return null;
    const deviceName = port.pdu_device_name;
    if (deviceName.includes('PDUA') || deviceName.includes('PDU-A') || deviceName.includes('A路')) {
      return 'A';
    }
    if (deviceName.includes('PDUB') || deviceName.includes('PDU-B') || deviceName.includes('B路')) {
      return 'B';
    }
    return null;
  };

  // 从数据库获取历史数据
  useEffect(() => {
    const fetchHistoryData = async () => {
      if (!cabinet.cabinetId) return;

      try {
        setHistoryLoading(true);
        
        // 获取机柜的所有PDU端口
        const portsResponse = await pduPortAPI.getPortsByCabinet(cabinet.cabinetId);
        const ports = extractArrayFromResponse(portsResponse, 'data');
        
        if (ports.length === 0) {
          setHistoryDataA([]);
          setHistoryDataB([]);
          setHistoryLoading(false);
          return;
        }

        // 计算时间范围：使用配置的历史数据查询天数
        const now = new Date();
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() - historyDays);
        targetDate.setHours(0, 0, 0, 0); // 目标日期00:00:00（本地时间）
        
        const startTime = targetDate;
        const endTime = new Date(targetDate);
        endTime.setHours(23, 59, 59, 999); // 目标日期23:59:59（本地时间）
        
        // 计算UTC时间范围用于查询
        // 本地时间的一天可能跨越UTC时间的两个日期
        // 例如：本地时间12月9日00:00:00-23:59:59（UTC+8）对应UTC时间12月8日16:00:00-12月9日15:59:59
        // 为了确保覆盖所有可能的数据，我们查询更宽的范围：前一天00:00:00到后一天23:59:59（UTC时间）
        const extendedStartTime = new Date(startTime);
        extendedStartTime.setDate(extendedStartTime.getDate() - 1); // 向前一天
        extendedStartTime.setHours(0, 0, 0, 0);
        
        const extendedEndTime = new Date(endTime);
        extendedEndTime.setDate(extendedEndTime.getDate() + 1); // 向后一天
        extendedEndTime.setHours(23, 59, 59, 999);
        
        // 转换为ISO字符串（UTC时间）用于API查询
        const startTimeISOExtended = extendedStartTime.toISOString();
        const endTimeISOExtended = extendedEndTime.toISOString();

        // 将端口按A路和B路分组
        const portsA = ports.filter(port => getCircuitType(port) === 'A');
        const portsB = ports.filter(port => getCircuitType(port) === 'B');

        // 获取A路端口的电流历史数据
        const historyPromisesA = portsA.map(async (port) => {
          try {
            const response = await pduDataAPI.getHistoryData(
              port.id,
              'current',
              startTimeISOExtended,
              endTimeISOExtended
            );
            const data = extractArrayFromResponse(response, 'data');
            return data.map(item => ({
              ...item,
              portId: port.id
            }));
          } catch (error) {
            console.error(`Error fetching history for port ${port.id}:`, error);
            return [];
          }
        });

        // 获取B路端口的电流历史数据
        const historyPromisesB = portsB.map(async (port) => {
          try {
            const response = await pduDataAPI.getHistoryData(
              port.id,
              'current',
              startTimeISOExtended,
              endTimeISOExtended
            );
            const data = extractArrayFromResponse(response, 'data');
            return data.map(item => ({
              ...item,
              portId: port.id
            }));
          } catch (error) {
            console.error(`Error fetching history for port ${port.id}:`, error);
            return [];
          }
        });

        const [allHistoryDataA, allHistoryDataB] = await Promise.all([
          Promise.all(historyPromisesA),
          Promise.all(historyPromisesB)
        ]);

        let flatDataA = allHistoryDataA.flat();
        let flatDataB = allHistoryDataB.flat();
        
        // 过滤数据：只保留属于前一天本地时间的数据
        // 因为扩展了查询范围，需要过滤掉不属于前一天的数据
        const filterByLocalDate = (data, targetDate) => {
          const targetYear = targetDate.getFullYear();
          const targetMonth = targetDate.getMonth();
          const targetDay = targetDate.getDate();
          
          return data.filter(item => {
            if (!item.timestamp) return false;
            const itemDate = new Date(item.timestamp);
            // 检查是否属于目标日期（本地时间）
            const itemYear = itemDate.getFullYear();
            const itemMonth = itemDate.getMonth();
            const itemDay = itemDate.getDate();
            
            return itemYear === targetYear &&
                   itemMonth === targetMonth &&
                   itemDay === targetDay;
          });
        };
        
        flatDataA = filterByLocalDate(flatDataA, targetDate);
        flatDataB = filterByLocalDate(flatDataB, targetDate);

        // 处理A路数据：按时间戳分组并聚合
        // 注意：数据库返回的是UTC时间，我们需要转换为本地时间进行分组
        const timeMapA = new Map();
        flatDataA.forEach(item => {
          let timestamp;
          if (item.timestamp) {
            timestamp = new Date(item.timestamp).getTime();
            if (isNaN(timestamp)) {
              return;
            }
          } else {
            return;
          }
          
          // 将UTC时间转换为本地时间，然后按本地时间的小时分组
          const localDate = new Date(timestamp);
          const year = localDate.getFullYear();
          const month = localDate.getMonth();
          const date = localDate.getDate();
          const hour = localDate.getHours();
          
          // 使用本地时间的年月日和小时生成键
          const hourKey = new Date(year, month, date, hour, 0, 0, 0).getTime();
          
          if (!timeMapA.has(hourKey)) {
            timeMapA.set(hourKey, []);
          }
          const value = parseFloat(item.value);
          if (!isNaN(value)) {
            // 保留所有值，包括0（0值也可能表示有效数据）
            timeMapA.get(hourKey).push(value);
          }
        });


        // 处理B路数据：按时间戳分组并聚合
        // 注意：数据库返回的是UTC时间，我们需要转换为本地时间进行分组
        const timeMapB = new Map();
        flatDataB.forEach(item => {
          let timestamp;
          if (item.timestamp) {
            timestamp = new Date(item.timestamp).getTime();
            if (isNaN(timestamp)) {
              return;
            }
          } else {
            return;
          }
          
          // 将UTC时间转换为本地时间，然后按本地时间的小时分组
          const localDate = new Date(timestamp);
          const year = localDate.getFullYear();
          const month = localDate.getMonth();
          const date = localDate.getDate();
          const hour = localDate.getHours();
          
          // 使用本地时间的年月日和小时生成键
          const hourKey = new Date(year, month, date, hour, 0, 0, 0).getTime();
          
          if (!timeMapB.has(hourKey)) {
            timeMapB.set(hourKey, []);
          }
          const value = parseFloat(item.value);
          if (!isNaN(value)) {
            // 保留所有值，包括0（0值也可能表示有效数据）
            timeMapB.get(hourKey).push(value);
          }
        });


        // 生成完整的一天24小时时间点（从00:00到23:00）
        // baseDate是本地时间的目标日期（如：2025-12-09 00:00:00 本地时间）
        const generateFullDayData = (timeMap, baseDate) => {
          const fullDayData = [];
          const year = baseDate.getFullYear();
          const month = baseDate.getMonth();
          const day = baseDate.getDate();
          
          // 生成24小时的数据点（使用本地时间，与timeMap中的键生成方式一致）
          for (let hour = 0; hour < 24; hour++) {
            // 使用本地时间生成键，与数据处理时保持一致
            const hourTimestamp = new Date(year, month, day, hour, 0, 0, 0);
            const timestamp = hourTimestamp.getTime();
            const hourKey = timestamp; // 使用相同的方式生成key
            
            const values = timeMap.get(hourKey);
            
            const hours = hour.toString().padStart(2, '0');
            const monthStr = (month + 1).toString().padStart(2, '0');
            const dayStr = day.toString().padStart(2, '0');
            const timeLabel = `${monthStr}-${dayStr} ${hours}:00`;
            
            if (values && values.length > 0) {
              // 有数据，计算平均值
              const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
              fullDayData.push({
                time: timeLabel,
                value: avgValue,
                timestamp: timestamp
              });
            } else {
              // 没有数据，填充为0
              fullDayData.push({
                time: timeLabel,
                value: 0,
                timestamp: timestamp
              });
            }
          }
          
          return fullDayData.sort((a, b) => a.timestamp - b.timestamp);
        };

        // 转换为图表数据格式，生成完整的一天24小时 - A路
        const chartDataA = generateFullDayData(timeMapA, targetDate);

        // 转换为图表数据格式，生成完整的一天24小时 - B路
        const chartDataB = generateFullDayData(timeMapB, targetDate);

        setHistoryDataA(chartDataA);
        setHistoryDataB(chartDataB);
      } catch (error) {
        console.error('Error fetching history data:', error);
        setHistoryDataA([]);
        setHistoryDataB([]);
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchHistoryData();
  }, [cabinet.cabinetId, historyDays]);

  // 使用transformedData获取数据（如果可用），否则使用pduData
  const dataSource = transformedData || pduData;
  const circuitA = dataSource?.circuitA || {};
  const circuitB = dataSource?.circuitB || {};
  const currentA = circuitA.current || 0;
  const currentB = circuitB.current || 0;
  const switchA = circuitA.switchStatus || 0;
  const switchB = circuitB.switchStatus || 0;

  return (
    <div className="cabinet-detail">
      <div className="cabinet-detail-header">
        <div>
          <h2 className="cabinet-detail-title">
            <ThunderboltOutlined className="cabinet-detail-title-icon" />
            {cabinet.name}
          </h2>
          <span className={`cabinet-detail-status ${statusColor}`}>
            {loading ? '加载中...' : (transformedData || pduData) ? '在线' : '离线'}
          </span>
        </div>
        <button onClick={onClose} className="cabinet-detail-close">
          <CloseOutlined />
        </button>
      </div>

      <div className="cabinet-detail-content">
        {/* 关键指标 */}
        <div className="cabinet-metrics-grid">
          <div className="cabinet-metric-card">
            <div className="metric-header">
              <ThunderboltOutlined className="metric-icon" />
              <span className="metric-label">电能</span>
            </div>
            <div className="metric-value">
              {totalEnergy.toFixed(2)} <span className="metric-unit">kWh</span>
            </div>
          </div>
          <div className="cabinet-metric-card">
            <div className="metric-header">
              <LineChartOutlined className="metric-icon" />
              <span className="metric-label">电流谐波失真</span>
            </div>
            <div className="metric-value">
              {thdCurrent.toFixed(2)} <span className="metric-unit">%</span>
            </div>
          </div>
        </div>

        {/* 电流监测 */}
        <div className="cabinet-section">
          <h3 className="cabinet-section-title">
            <ThunderboltOutlined className="section-icon" />
            电流监测
          </h3>
          <div className="cabinet-current-details">
            <div className="current-item">
              <div className="current-header">
                <span className="current-label">A 路电流</span>
                <span className="current-value">{currentA.toFixed(2)} A</span>
              </div>
              <div className="current-progress">
                <div 
                  className="current-progress-bar" 
                  style={{ width: `${Math.min((currentA / (displaySettings?.currentProgressMax || 32)) * 100, 100)}%` }} 
                />
              </div>
            </div>
            <div className="current-item">
              <div className="current-header">
                <span className="current-label">B 路电流</span>
                <span className="current-value">{currentB.toFixed(2)} A</span>
              </div>
              <div className="current-progress">
                <div 
                  className="current-progress-bar" 
                  style={{ width: `${Math.min((currentB / (displaySettings?.currentProgressMax || 32)) * 100, 100)}%` }} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* 开关状态 */}
        <div className="cabinet-switches">
          <div className={`switch-card ${switchA ? 'switch-on' : 'switch-off'}`}>
            <div className="switch-label">开关 A</div>
            <div className={`switch-status ${switchA ? 'switch-status-on' : 'switch-status-off'}`}>
              {switchA ? '开启' : '关闭'}
            </div>
          </div>
          <div className={`switch-card ${switchB ? 'switch-on' : 'switch-off'}`}>
            <div className="switch-label">开关 B</div>
            <div className={`switch-status ${switchB ? 'switch-status-on' : 'switch-status-off'}`}>
              {switchB ? '开启' : '关闭'}
            </div>
          </div>
        </div>

        {/* 历史趋势图 - A路和B路分两张图表 */}
        <div className="cabinet-charts-container">
          {/* A路电流趋势图 */}
          <div className="cabinet-chart">
            <div className="chart-header">
              A路电流趋势（前{displaySettings?.historyDataDays || 1}天）
              {historyLoading && <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>加载中...</span>}
            </div>
            <ResponsiveContainer width="100%" height={displaySettings?.chartHeight?.default || 200}>
              <AreaChart data={historyDataA} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCurrentA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} vertical={false} />
                <XAxis 
                  dataKey="time" 
                  tick={{fontSize: 11, fill: '#64748b'}} 
                  axisLine={{ stroke: '#475569', strokeWidth: 1 }}
                  tickLine={{ stroke: '#475569' }}
                  height={30}
                  tickFormatter={(value) => {
                    // 提取时间部分，只显示小时（如：12-09 04:00 -> 04:00）
                    const timePart = value.split(' ')[1] || '';
                    const hour = timePart.split(':')[0] || '';
                    // 使用配置的X轴标签间隔
                    const interval = displaySettings?.chartXAxisInterval || 4;
                    const hourNum = parseInt(hour);
                    if (hourNum % interval === 0) {
                      return hour + ':00';
                    }
                    return '';
                  }}
                />
                <YAxis 
                  tick={{fontSize: 11, fill: '#94a3b8', fontWeight: 500}} 
                  axisLine={{ stroke: '#475569', strokeWidth: 1 }}
                  tickLine={{ stroke: '#475569' }}
                  domain={['auto', 'auto']}
                  width={45}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                    padding: '8px 12px'
                  }}
                  labelStyle={{ 
                    color: '#e2e8f0', 
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px'
                  }}
                  itemStyle={{ 
                    color: '#60a5fa',
                    fontSize: '13px',
                    fontWeight: 500
                  }}
                  formatter={(value, name) => [`${value.toFixed(2)} A`, 'A路电流']}
                  labelFormatter={(label) => `时间: ${label}`}
                  cursor={{ stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5 5' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#3b82f6" 
                  strokeWidth={2.5}
                  fillOpacity={1} 
                  fill="url(#colorCurrentA)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#3b82f6', stroke: '#1e293b', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* B路电流趋势图 */}
          <div className="cabinet-chart">
            <div className="chart-header">
              B路电流趋势（前{displaySettings?.historyDataDays || 1}天）
              {historyLoading && <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>加载中...</span>}
            </div>
            <ResponsiveContainer width="100%" height={displaySettings?.chartHeight?.default || 200}>
              <AreaChart data={historyDataB} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCurrentB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="50%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} vertical={false} />
                <XAxis 
                  dataKey="time" 
                  tick={{fontSize: 11, fill: '#64748b'}} 
                  axisLine={{ stroke: '#475569', strokeWidth: 1 }}
                  tickLine={{ stroke: '#475569' }}
                  height={30}
                  tickFormatter={(value) => {
                    // 提取时间部分，只显示小时（如：12-09 04:00 -> 04:00）
                    const timePart = value.split(' ')[1] || '';
                    const hour = timePart.split(':')[0] || '';
                    // 使用配置的X轴标签间隔
                    const interval = displaySettings?.chartXAxisInterval || 4;
                    const hourNum = parseInt(hour);
                    if (hourNum % interval === 0) {
                      return hour + ':00';
                    }
                    return '';
                  }}
                />
                <YAxis 
                  tick={{fontSize: 11, fill: '#94a3b8', fontWeight: 500}} 
                  axisLine={{ stroke: '#475569', strokeWidth: 1 }}
                  tickLine={{ stroke: '#475569' }}
                  domain={['auto', 'auto']}
                  width={45}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                    padding: '8px 12px'
                  }}
                  labelStyle={{ 
                    color: '#e2e8f0', 
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px'
                  }}
                  itemStyle={{ 
                    color: '#34d399',
                    fontSize: '13px',
                    fontWeight: 500
                  }}
                  formatter={(value, name) => [`${value.toFixed(2)} A`, 'B路电流']}
                  labelFormatter={(label) => `时间: ${label}`}
                  cursor={{ stroke: '#10b981', strokeWidth: 2, strokeDasharray: '5 5' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#10b981" 
                  strokeWidth={2.5}
                  fillOpacity={1} 
                  fill="url(#colorCurrentB)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#10b981', stroke: '#1e293b', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CabinetDetail;
