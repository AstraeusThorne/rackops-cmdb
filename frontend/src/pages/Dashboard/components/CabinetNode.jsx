import React, { useMemo } from 'react';
import './CabinetNode.css';

/**
 * 机柜节点组件
 * @param {Object} props - 组件属性
 * @param {Object} props.cabinet - 机柜信息
 * @param {Function} props.onClick - 点击回调
 * @param {boolean} props.isSelected - 是否选中
 * @param {Object} props.statusData - 状态数据（从父组件批量获取，避免单独查询）
 *   { current: number, status: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFFLINE' }
 */
const CabinetNode = ({ cabinet, onClick, isSelected, statusData }) => {
  // 使用传入的状态数据，如果没有则默认为离线
  const status = statusData?.status || 'OFFLINE';
  const totalCurrent = statusData?.current || 0;

  // 确定样式类
  let baseClass = 'cabinet-node';
  let indicatorClass = 'cabinet-indicator';
  let glow = '';

  switch(status) {
    case 'NORMAL':
      baseClass += ' cabinet-node-normal';
      indicatorClass += ' cabinet-indicator-normal';
      break;
    case 'WARNING':
      baseClass += ' cabinet-node-warning';
      indicatorClass += ' cabinet-indicator-warning';
      break;
    case 'CRITICAL':
      baseClass += ' cabinet-node-critical';
      indicatorClass += ' cabinet-indicator-critical';
      glow = 'cabinet-glow-critical';
      break;
    case 'OFFLINE':
      baseClass += ' cabinet-node-offline';
      indicatorClass += ' cabinet-indicator-offline';
      break;
  }

  if (isSelected) {
    baseClass += ' cabinet-node-selected';
  }

  // 使用数据库中的机柜名称（格式：XX-YY，如 01-01, 02-01）
  // 如果机柜名称存在，直接使用；否则使用索引计算
  const cabinetNumber = cabinet.name || `${String(Math.floor(cabinet.index / 14) + 1).padStart(2, '0')}-${String((cabinet.index % 14) + 1).padStart(2, '0')}`;

  return (
    <button 
      onClick={onClick}
      className={`${baseClass} ${glow}`}
    >
      <div className={indicatorClass} />
      <span className="cabinet-index">{cabinetNumber}</span>
      
      {/* 悬停提示 */}
      <div className="cabinet-tooltip">
        {cabinet.name} | {totalCurrent.toFixed(2)}A
      </div>
    </button>
  );
};

export default CabinetNode;

