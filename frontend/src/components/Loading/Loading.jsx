import React from 'react';
import { Spin } from 'antd';
import styles from './Loading.module.css';

const Loading = () => {
  return (
    <div className={styles.loadingContainer}>
      <Spin size="large">
        <div style={{ padding: '50px', backgroundColor: 'transparent' }} />
      </Spin>
    </div>
  );
};

export default Loading; 