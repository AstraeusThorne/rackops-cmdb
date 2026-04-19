import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Space, Modal, Typography } from 'antd';
import { UserOutlined, IdcardOutlined, PhoneOutlined, LockOutlined, MailOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { dutyPersonnelAPI } from '../../api';

const { Text, Paragraph } = Typography;

/**
 * 值班人员注册页面
 */
const RegisterDutyPersonnel = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [registeredUsername, setRegisteredUsername] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      await dutyPersonnelAPI.register(values);
      // 保存用户名（姓名就是登录用户名）
      setRegisteredUsername(values.name);
      setShowSuccessModal(true);
      form.resetFields();
    } catch (error) {
      const errorMsg = error.response?.data?.error || 
                      error.response?.data?.non_field_errors?.[0] ||
                      error.message || 
                      '注册失败，请重试';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleModalOk = () => {
    setShowSuccessModal(false);
    navigate('/login');
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: '#f0f2f5',
      padding: '20px'
    }}>
      <Card 
        title="值班人员注册" 
        style={{ width: '100%', maxWidth: 500 }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            name="employee_id"
            label="员工ID"
            rules={[
              { required: true, message: '请输入员工ID' },
              { max: 50, message: '员工ID不能超过50个字符' }
            ]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="请输入员工ID"
            />
          </Form.Item>

          <Form.Item
            name="name"
            label={
              <span>
                姓名 <Text type="warning" style={{ fontSize: '12px' }}>（此姓名将作为登录用户名，请牢记）</Text>
              </span>
            }
            rules={[
              { required: true, message: '请输入姓名' },
              { max: 100, message: '姓名不能超过100个字符' }
            ]}
            extra="提示：您注册时填写的姓名就是您的登录用户名，请务必记住！"
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="请输入姓名（将作为登录用户名）"
            />
          </Form.Item>

          <Form.Item
            name="id_card"
            label="身份证号"
            rules={[
              { required: true, message: '请输入身份证号' },
              { len: 18, message: '身份证号必须为18位' },
              { pattern: /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/, message: '请输入有效的身份证号' }
            ]}
          >
            <Input 
              prefix={<IdcardOutlined />} 
              placeholder="请输入18位身份证号"
              maxLength={18}
            />
          </Form.Item>

          <Form.Item
            name="phone"
            label="电话"
            rules={[
              { required: true, message: '请输入电话' },
              { max: 20, message: '电话不能超过20个字符' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号码' }
            ]}
          >
            <Input 
              prefix={<PhoneOutlined />} 
              placeholder="请输入手机号码"
            />
          </Form.Item>

          <Form.Item
            name="type"
            label="类型"
            rules={[
              { required: true, message: '请输入类型' },
              { max: 50, message: '类型不能超过50个字符' }
            ]}
          >
            <Input 
              placeholder="请输入值班人员类型"
            />
          </Form.Item>

          <Form.Item
            name="email"
            label="邮箱（可选）"
            rules={[
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input 
              prefix={<MailOutlined />} 
              placeholder="请输入邮箱（可选）"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' }
            ]}
          >
            <Input.Password 
              prefix={<LockOutlined />} 
              placeholder="请输入密码（至少6个字符）"
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading}
                block
              >
                注册
              </Button>
              <Button 
                onClick={() => navigate('/login')}
                block
              >
                返回登录
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* 注册成功提示Modal */}
      <Modal
        title={
          <Space>
            <InfoCircleOutlined style={{ color: '#52c41a' }} />
            <span>注册成功</span>
          </Space>
        }
        open={showSuccessModal}
        onOk={handleModalOk}
        onCancel={handleModalOk}
        okText="前往登录"
        cancelText="关闭"
        closable={false}
        maskClosable={false}
      >
        <div style={{ padding: '20px 0' }}>
          <Paragraph>
            <Text strong>恭喜您注册成功！</Text>
          </Paragraph>
          <Paragraph>
            您的注册申请已提交，请等待管理员审核。审核通过后您将收到站内消息通知。
          </Paragraph>
          <Paragraph style={{ 
            background: '#f0f2f5', 
            padding: '15px', 
            borderRadius: '4px',
            marginTop: '20px'
          }}>
            <Text strong style={{ color: '#1890ff', fontSize: '16px' }}>
              重要提示：
            </Text>
            <br />
            <Text style={{ fontSize: '14px' }}>
              您的<Text strong style={{ color: '#ff4d4f' }}>登录用户名</Text>是：
            </Text>
            <br />
            <Text 
              copyable 
              style={{ 
                fontSize: '18px', 
                fontWeight: 'bold', 
                color: '#1890ff',
                display: 'inline-block',
                marginTop: '8px'
              }}
            >
              {registeredUsername}
            </Text>
            <br />
            <Text type="warning" style={{ fontSize: '12px', marginTop: '8px', display: 'block' }}>
              ⚠️ 请务必记住此用户名，这是您登录系统的唯一凭证！
            </Text>
          </Paragraph>
        </div>
      </Modal>
    </div>
  );
};

export default RegisterDutyPersonnel;

