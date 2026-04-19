import React from 'react';
import { Card, Row, Col, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  BankOutlined,
  InboxOutlined,
  TeamOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  AppstoreOutlined,
  ToolOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  EditOutlined,
  UploadOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import useAuth from '../../hooks/useAuth';
import './Backoffice.css';

/**
 * 后台管理主页
 * 提供各种管理功能的入口
 * @returns {React.ReactElement} 后台管理页面组件
 */
const Backoffice = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // 判断是否为管理员
  const isAdmin = user && (user.is_staff === true || user.is_superuser === true);

  const managementItems = [
    {
      title: '机房管理',
      icon: <BankOutlined />,
      path: '/backoffice/room',
      description: '添加、编辑和管理机房信息'
    },
    {
      title: '机柜管理',
      icon: <InboxOutlined />,
      path: '/backoffice/cabinet',
      description: '添加、编辑和管理机柜信息'
    },
    {
      title: '值班人员管理',
      icon: <TeamOutlined />,
      path: '/backoffice/duty-personnel',
      description: '管理值班人员信息和排班'
    },
    {
      title: '客户管理',
      icon: <UserOutlined />,
      path: '/backoffice/client',
      description: '管理客户信息和授权'
    },
    {
      title: '授权单位管理',
      icon: <SafetyCertificateOutlined />,
      path: '/backoffice/authorized-org',
      description: '管理授权单位信息'
    },
    {
      title: '设备管理',
      icon: <AppstoreOutlined />,
      path: '/backoffice/device',
      description: '管理机房设备资产'
    },
    {
      title: '下架设备管理',
      icon: <ToolOutlined />,
      path: '/backoffice/decommissioned-device',
      description: '查看和管理已下架设备'
    },
    {
      title: '设备告警管理',
      icon: <AlertOutlined />,
      path: '/backoffice/device-alert',
      description: '监控和处理设备告警信息'
    },
    ...(isAdmin ? [
      {
        title: '数据导入',
        icon: <UploadOutlined />,
        path: '/backoffice/data-import',
        description: '从Excel文件导入运维故事数据'
      },
      {
        title: '数据导出',
        icon: <DownloadOutlined />,
        path: '/backoffice/data-export',
        description: '导出事件汇总、人员进出、上架汇总、下架汇总为 Excel'
      },
      {
        title: '值班人员审核',
        icon: <CheckCircleOutlined />,
        path: '/backoffice/duty-personnel-approval',
        description: '审核值班人员注册申请'
      },
      {
        title: '历史记录',
        icon: <HistoryOutlined />,
        path: '/backoffice/history',
        description: '查看和回退操作历史记录'
      },
      {
        title: '值班人员操作记录',
        icon: <EditOutlined />,
        path: '/backoffice/duty-personnel-operations',
        description: '查看值班人员的操作记录和统计'
      }
    ] : [])
  ];

  return (
    <div className="backoffice-container">
      <h2>后台管理</h2>
      
      <Row gutter={[16, 16]}>
        {managementItems.map(item => (
          <Col key={item.path} xs={24} sm={12} md={8} lg={8} xl={6}>
            <Card
              hoverable
              className="management-card"
              onClick={() => navigate(item.path)}
            >
              <div className="card-icon">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <Button type="primary" block>
                进入管理
              </Button>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default Backoffice; 