import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Spin, Alert } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined, IdcardOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../../api/authAPI';
import './Register.css';

/**
 * 注册页面组件
 * @returns {JSX.Element} 注册页面
 */
const Register = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  /**
   * 处理注册表单提交
   * @param {Object} values - 表单值
   */
  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      setError(null);
      
      // 发送注册请求
      await register({
        username: values.username,
        password: values.password,
        password_confirm: values.confirm,
        email: values.email,
        first_name: values.firstName,
        last_name: values.lastName,
        phone: values.phone
      });
      
      // 注册成功
      setSuccess(true);
      
      // 3秒后重定向到登录页
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      const errorData = err.response?.data;
      if (typeof errorData === 'object') {
        // 处理多个错误字段
        const errorMessages = Object.entries(errorData)
          .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
          .join('\n');
        setError(errorMessages);
      } else {
        setError(err.response?.data?.detail || err.message || '注册失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  // 邮箱验证正则表达式 - 更严格的验证
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  // 电话号码验证正则表达式 - 中国手机号
  const phonePattern = /^1[3-9]\d{9}$/;

  return (
    <div className="register-container">
      <Card className="register-card">
        <Typography.Title level={2} className="register-title">
          用户注册
        </Typography.Title>
        
        {error && (
          <Alert
            message="注册错误"
            description={error}
            type="error"
            showIcon
            className="register-message"
            closable
            onClose={() => setError(null)}
          />
        )}
        
        {success && (
          <Alert
            message="注册成功"
            description="账号创建成功，即将跳转到登录页面..."
            type="success"
            showIcon
            className="register-message"
          />
        )}
        
        <Spin spinning={loading}>
          <Form
            name="register"
            onFinish={handleSubmit}
            size="large"
            className="register-form"
            scrollToFirstError
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入用户名!' },
                { min: 3, message: '用户名至少3个字符!' }
              ]}
            >
              <Input 
                prefix={<UserOutlined />} 
                placeholder="用户名" 
                autoComplete="username"
                id="username"
              />
            </Form.Item>
            
            <Form.Item
              name="email"
              rules={[
                { required: true, message: '请输入邮箱!' },
                { 
                  pattern: emailPattern,
                  message: '请输入有效的邮箱地址!',
                  validateTrigger: 'onBlur'
                }
              ]}
            >
              <Input 
                prefix={<MailOutlined />} 
                placeholder="邮箱" 
                autoComplete="email"
                id="email"
              />
            </Form.Item>
            
            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码!' },
                { min: 6, message: '密码至少6个字符!' }
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
                autoComplete="new-password"
                id="password"
              />
            </Form.Item>
            
            <Form.Item
              name="confirm"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码!' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致!'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="确认密码"
                autoComplete="new-password"
                id="confirm-password"
              />
            </Form.Item>
            
            <Form.Item
              name="firstName"
              rules={[{ required: true, message: '请输入名字!' }]}
            >
              <Input 
                prefix={<IdcardOutlined />} 
                placeholder="名字" 
                id="firstName"
                autoComplete="given-name"
              />
            </Form.Item>
            
            <Form.Item
              name="lastName"
              rules={[{ required: true, message: '请输入姓氏!' }]}
            >
              <Input 
                prefix={<IdcardOutlined />} 
                placeholder="姓氏" 
                id="lastName"
                autoComplete="family-name"
              />
            </Form.Item>
            
            <Form.Item
              name="phone"
              rules={[
                { 
                  required: true,
                  message: '请输入手机号码!' 
                },
                { 
                  pattern: phonePattern, 
                  message: '请输入有效的11位手机号码!', 
                  validateTrigger: 'onBlur' 
                }
              ]}
            >
              <Input 
                prefix={<PhoneOutlined />} 
                placeholder="手机号码" 
                id="phone"
                autoComplete="tel"
              />
            </Form.Item>

            <Form.Item className="register-form-button">
              <Button type="primary" htmlType="submit" block loading={loading}>
                注册
              </Button>
            </Form.Item>
            
            <Form.Item className="register-form-login">
              <Link to="/login">已有账号？立即登录</Link>
            </Form.Item>
          </Form>
        </Spin>
      </Card>
    </div>
  );
};

export default Register;