import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Spin, Alert } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import './Login.css';

/**
 * 登录页面组件
 * @returns {JSX.Element} 登录页面
 */
const Login = () => {
  const { login, loading } = useAuth();
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  /**
   * 处理登录表单提交
   * @param {Object} values - 表单值
   */
  const handleSubmit = async (values) => {
    try {
      await login({
        username: values.username,
        password: values.password
      });
      // 登录成功后重定向到首页
      navigate('/');
    } catch (err) {
      console.error('登录错误详情:', err);
      
      // 更全面的错误处理
      let errorMessage = '登录失败，请检查用户名和密码';
      
      if (err.response?.data) {
        if (typeof err.response.data === 'string') {
          errorMessage = err.response.data;
        } else if (err.response.data.detail) {
          errorMessage = err.response.data.detail;
        } else if (err.response.data.error) {
          errorMessage = err.response.data.error;
        } else if (err.response.data.message) {
          errorMessage = err.response.data.message;
        } else if (err.response.data.non_field_errors) {
          errorMessage = Array.isArray(err.response.data.non_field_errors) 
            ? err.response.data.non_field_errors.join(', ')
            : err.response.data.non_field_errors;
        } else if (typeof err.response.data === 'object') {
          // 处理多字段错误
          errorMessage = Object.entries(err.response.data)
            .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
            .join('\n');
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    }
  };

  return (
    <div className="login-container">
      <Card className="login-card">
        <Typography.Title level={2} className="login-title">
          机房设备管理系统
        </Typography.Title>
        
        {error && (
          <Alert
            message="登录错误"
            description={error}
            type="error"
            showIcon
            className="login-error"
            closable
            onClose={() => setError(null)}
          />
        )}
        
        <Spin spinning={loading}>
          <Form
            name="login"
            initialValues={{ 
              username: '',  // 登录界面不预填账号，显示为空
              password: ''   // 登录界面不预填密码，显示为空
            }}
            onFinish={handleSubmit}
            size="large"
            className="login-form"
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入用户名!' }]}
            >
              <Input 
                prefix={<UserOutlined />} 
                placeholder="用户名" 
                autoComplete="username"
                id="username"
              />
            </Form.Item>
            
            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码!' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
                autoComplete="current-password"
                id="password"
              />
            </Form.Item>

            <Form.Item className="login-form-button">
              <Button type="primary" htmlType="submit" block loading={loading}>
                登录
              </Button>
            </Form.Item>
            
            <Form.Item className="login-form-register">
              <Link to="/register-duty-personnel">值班人员注册</Link>
            </Form.Item>
          </Form>
        </Spin>
      </Card>
    </div>
  );
};

export default Login;