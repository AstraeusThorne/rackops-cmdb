import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// 抑制来自第三方库的已知警告（不影响功能）
import './utils/suppressWarnings';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 