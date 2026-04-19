import React from 'react';
import './StatCard.css';

/**
 * 统计卡片组件
 */
const StatCard = ({ label, value, icon, iconColor = '#22d3ee', alert = false }) => {
  return (
    <div className={`stat-card ${alert ? 'stat-card-alert' : ''}`}>
      <div className="stat-card-icon" style={{ backgroundColor: '#1e293b', color: iconColor }}>
        {icon}
      </div>
      <div className="stat-card-content">
        <div className="stat-card-label">{label}</div>
        <div className={`stat-card-value ${alert ? 'stat-card-value-alert' : ''}`}>
          {value}
        </div>
      </div>
    </div>
  );
};

export default StatCard;

