import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Spin, Empty } from 'antd';
import { CHART_COLORS } from '../../constants/dashboardTypes';

/**
 * 基础图表组件
 * 封装ECharts，提供统一的样式和配置
 */
const BaseChart = React.memo(({
  type = 'line',
  data = [],
  title = '',
  loading = false,
  height = 300,
  options = {},
  style = {},
  className = '',
  ...props
}) => {
  /**
   * 生成图表配置
   */
  const chartOptions = useMemo(() => {
    if (!data || data.length === 0) {
      return {};
    }

    const baseConfig = {
      title: {
        text: title,
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'normal'
        }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#ccc',
        borderWidth: 1,
        textStyle: {
          color: '#333'
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      color: CHART_COLORS.primary,
      ...options
    };

    // 根据图表类型生成不同配置
    switch (type) {
      case 'line':
        return {
          ...baseConfig,
          xAxis: {
            type: 'category',
            data: data.map(item => item.name || item.label),
            boundaryGap: false
          },
          yAxis: {
            type: 'value'
          },
          series: [{
            data: data.map(item => item.value),
            type: 'line',
            smooth: true,
            areaStyle: {
              opacity: 0.1
            }
          }]
        };

      case 'bar':
        return {
          ...baseConfig,
          xAxis: {
            type: 'category',
            data: data.map(item => item.name || item.label)
          },
          yAxis: {
            type: 'value'
          },
          series: [{
            data: data.map(item => item.value),
            type: 'bar',
            itemStyle: {
              borderRadius: [4, 4, 0, 0]
            }
          }]
        };

      case 'pie':
        return {
          ...baseConfig,
          tooltip: {
            trigger: 'item',
            formatter: '{a} <br/>{b}: {c} ({d}%)'
          },
          legend: {
            orient: 'vertical',
            left: 'left',
            data: data.map(item => item.name || item.label)
          },
          series: [{
            name: title,
            type: 'pie',
            radius: '50%',
            data: data,
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }]
        };

      case 'heatmap':
        return {
          ...baseConfig,
          tooltip: {
            position: 'top'
          },
          grid: {
            height: '50%',
            top: '10%'
          },
          xAxis: {
            type: 'category',
            data: data.xAxis || [],
            splitArea: {
              show: true
            }
          },
          yAxis: {
            type: 'category',
            data: data.yAxis || [],
            splitArea: {
              show: true
            }
          },
          visualMap: {
            min: 0,
            max: data.max || 100,
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: '15%'
          },
          series: [{
            name: title,
            type: 'heatmap',
            data: data.series || [],
            label: {
              show: true
            },
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }]
        };

      default:
        return baseConfig;
    }
  }, [type, data, title, options]);

  if (loading) {
    return (
      <div style={{ 
        height, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        ...style 
      }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{ 
        height, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        ...style 
      }}>
        <Empty description="暂无数据" />
      </div>
    );
  }

  return (
    <ReactECharts
      option={chartOptions}
      style={{ height, ...style }}
      className={className}
      {...props}
    />
  );
});

BaseChart.displayName = 'BaseChart';

export default BaseChart; 