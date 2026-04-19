import React, { useState, useEffect } from 'react';
import {
  Form,
  Input,
  Button,
  Card,
  Typography,
  Spin,
  Alert,
  Tabs,
  message,
  Upload,
  Avatar
} from 'antd';
import { UploadOutlined, UserOutlined, LockOutlined } from '@ant-design/icons';
import useAuth from '../../hooks/useAuth';
import { updateProfile, changePassword } from '../../api/authAPI';
import './Profile.css';

/**
 * 用户资料页面组件
 * @returns {JSX.Element} 用户资料页面
 */
const Profile = () => {
  const { user, logout } = useAuth();
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [avatar, setAvatar] = useState(null);

  // 设置初始表单值
  useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone || '',
        department: user.department || '',
        position: user.position || ''
      });
      
      if (user.avatar) {
        setAvatar(user.avatar);
      }
    }
  }, [user, profileForm]);

  /**
   * 处理更新资料表单提交
   * @param {Object} values - 表单值
   */
  const handleProfileUpdate = async (values) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      
      await updateProfile({
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone,
        department: values.department,
        position: values.position
      });
      
      setSuccess('资料更新成功');
      message.success('资料更新成功');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '更新失败');
      message.error('更新失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理修改密码表单提交
   * @param {Object} values - 表单值
   */
  const handlePasswordChange = async (values) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      
      await changePassword({
        old_password: values.oldPassword,
        new_password: values.newPassword,
        confirm_password: values.confirmPassword
      });
      
      setSuccess('密码修改成功，请重新登录');
      message.success('密码修改成功，请重新登录');
      
      // 清空表单
      passwordForm.resetFields();
      
      // 3秒后登出
      setTimeout(() => {
        logout();
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || '密码修改失败');
      message.error('密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 上传头像前的处理
   */
  const beforeUpload = (file) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error('只能上传图片文件!');
    }
    
    const isLt2M = file.size / 1024 / 1024 < 2;
    if (!isLt2M) {
      message.error('图片必须小于2MB!');
    }
    
    return isImage && isLt2M;
  };

  /**
   * 头像上传状态改变处理
   */
  const handleAvatarChange = (info) => {
    if (info.file.status === 'uploading') {
      setLoading(true);
      return;
    }
    
    if (info.file.status === 'done') {
      setLoading(false);
      setAvatar(info.file.response.url);
      message.success('头像上传成功');
    } else if (info.file.status === 'error') {
      setLoading(false);
      message.error('头像上传失败');
    }
  };

  if (!user) {
    return <Spin size="large" />;
  }

  return (
    <div className="profile-container">
      <Card className="profile-card">
        <Typography.Title level={2} className="profile-title">
          个人资料
        </Typography.Title>
        
        {error && (
          <Alert
            message="错误"
            description={error}
            type="error"
            showIcon
            className="profile-message"
            closable
            onClose={() => setError(null)}
          />
        )}
        
        {success && (
          <Alert
            message="成功"
            description={success}
            type="success"
            showIcon
            className="profile-message"
            closable
            onClose={() => setSuccess(null)}
          />
        )}
        
        <Tabs 
          defaultActiveKey="profile"
          items={[
            {
              key: 'profile',
              label: '基本资料',
              children: (
                <div>
                  <div className="profile-avatar-section">
                    <Avatar 
                      size={100} 
                      icon={<UserOutlined />}
                      src={avatar}
                      className="profile-avatar"
                    />
                    <Upload
                      name="avatar"
                      action="/api/users/upload-avatar/"
                      beforeUpload={beforeUpload}
                      onChange={handleAvatarChange}
                      showUploadList={false}
                    >
                      <Button icon={<UploadOutlined />}>上传头像</Button>
                    </Upload>
                  </div>
                  
                  <Spin spinning={loading}>
                    <Form
                      form={profileForm}
                      name="profile"
                      onFinish={handleProfileUpdate}
                      layout="vertical"
                      className="profile-form"
                    >
                      <Form.Item
                        name="username"
                        label="用户名"
                      >
                        <Input disabled />
                      </Form.Item>
                      
                      <Form.Item
                        name="email"
                        label="邮箱"
                      >
                        <Input disabled />
                      </Form.Item>
                      
                      <Form.Item
                        name="first_name"
                        label="名字"
                        rules={[{ required: true, message: '请输入名字!' }]}
                      >
                        <Input />
                      </Form.Item>
                      
                      <Form.Item
                        name="last_name"
                        label="姓氏"
                        rules={[{ required: true, message: '请输入姓氏!' }]}
                      >
                        <Input />
                      </Form.Item>
                      
                      <Form.Item
                        name="phone"
                        label="手机号码"
                        rules={[
                          { required: false },
                          { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号码!', validateTrigger: 'onBlur' }
                        ]}
                      >
                        <Input />
                      </Form.Item>
                      
                      <Form.Item
                        name="department"
                        label="部门"
                      >
                        <Input />
                      </Form.Item>
                      
                      <Form.Item
                        name="position"
                        label="职位"
                      >
                        <Input />
                      </Form.Item>
                      
                      <Form.Item>
                        <Button type="primary" htmlType="submit" loading={loading}>
                          更新资料
                        </Button>
                      </Form.Item>
                    </Form>
                  </Spin>
                </div>
              )
            },
            {
              key: 'password',
              label: '修改密码',
              children: (
                <Spin spinning={loading}>
                  <Form
                    form={passwordForm}
                    name="password"
                    onFinish={handlePasswordChange}
                    layout="vertical"
                    className="profile-form"
                  >
                    <Form.Item
                      name="oldPassword"
                      label="当前密码"
                      rules={[{ required: true, message: '请输入当前密码!' }]}
                    >
                      <Input.Password 
                        prefix={<LockOutlined />}
                        placeholder="当前密码"
                      />
                    </Form.Item>
                    
                    <Form.Item
                      name="newPassword"
                      label="新密码"
                      rules={[
                        { required: true, message: '请输入新密码!' },
                        { min: 6, message: '密码至少6个字符!' }
                      ]}
                    >
                      <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="新密码"
                      />
                    </Form.Item>
                    
                    <Form.Item
                      name="confirmPassword"
                      label="确认新密码"
                      dependencies={['newPassword']}
                      rules={[
                        { required: true, message: '请确认新密码!' },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            if (!value || getFieldValue('newPassword') === value) {
                              return Promise.resolve();
                            }
                            return Promise.reject(new Error('两次输入的密码不一致!'));
                          },
                        }),
                      ]}
                    >
                      <Input.Password
                        prefix={<LockOutlined />}
                        placeholder="确认新密码"
                      />
                    </Form.Item>
                    
                    <Form.Item>
                      <Button type="primary" htmlType="submit" loading={loading}>
                        修改密码
                      </Button>
                    </Form.Item>
                  </Form>
                </Spin>
              )
            }
          ]}
        />
      </Card>
    </div>
  );
};

export default Profile;