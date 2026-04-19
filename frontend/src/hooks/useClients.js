import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { clientAPI } from '../api';

/**
 * 客户数据管理钩子
 * 用于获取和管理客户数据
 */
export const useClients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * 获取所有客户
   */
  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await clientAPI.getAllClients();
      setClients(response.data.results || response.data || []);
    } catch (err) {
      console.error('Error fetching clients:', err);
      setError(err);
      message.error('获取客户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 根据ID获取单个客户
   */
  const getClientById = useCallback((id) => {
    return clients.find(client => client.id === id) || null;
  }, [clients]);

  /**
   * 创建新客户
   */
  const createClient = useCallback(async (clientData) => {
    try {
      setLoading(true);
      const response = await clientAPI.createClient(clientData);
      
      setClients(prevClients => [...prevClients, response.data]);
      message.success('客户创建成功');
      return response.data;
    } catch (err) {
      console.error('Error creating client:', err);
      message.error('创建客户失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 更新客户
   */
  const updateClient = useCallback(async (id, clientData) => {
    try {
      setLoading(true);
      const response = await clientAPI.updateClient(id, clientData);
      
      setClients(prevClients => 
        prevClients.map(client => 
          client.id === id ? { ...client, ...response.data } : client
        )
      );
      
      message.success('客户更新成功');
      return response.data;
    } catch (err) {
      console.error('Error updating client:', err);
      message.error('更新客户失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 删除客户
   */
  const deleteClient = useCallback(async (id) => {
    try {
      setLoading(true);
      await clientAPI.deleteClient(id);
      
      setClients(prevClients => 
        prevClients.filter(client => client.id !== id)
      );
      
      message.success('客户删除成功');
    } catch (err) {
      console.error('Error deleting client:', err);
      message.error('删除客户失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  return {
    clients,
    loading,
    error,
    fetchClients,
    getClientById,
    createClient,
    updateClient,
    deleteClient
  };
};

export default useClients;
