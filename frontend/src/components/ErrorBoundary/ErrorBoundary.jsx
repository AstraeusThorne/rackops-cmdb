import React from 'react';
import PropTypes from 'prop-types';
import { Alert, Card } from 'antd';
import './ErrorBoundary.module.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // 更新状态，下次渲染时显示回退UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // 可以在这里记录错误信息
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // 可以渲染任何自定义回退UI
      return (
        <div className="error-boundary-container">
          <Card className="error-card">
            <Alert
              message="程序出错了"
              description="很抱歉，程序遇到了意外错误。请刷新页面或联系管理员。"
              type="error"
              showIcon
            />
            {process.env.NODE_ENV === 'development' && (
              <div className="error-details">
                <h3>错误详情：</h3>
                <p>{this.state.error && this.state.error.toString()}</p>
                <pre>
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired
};

export default ErrorBoundary; 