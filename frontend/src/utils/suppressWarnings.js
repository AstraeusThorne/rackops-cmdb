/**
 * 抑制开发环境中的特定警告
 * 这些警告来自第三方库（如 Ant Design），不影响功能
 * 
 * 注意：此文件仅在开发环境中生效，生产环境不受影响
 */

if (process.env.NODE_ENV === 'development') {
  const originalError = console.error;
  const originalWarn = console.warn;

  // 检查是否包含 findDOMNode 相关警告
  const isFindDOMNodeWarning = (args) => {
    if (!args || args.length === 0) return false;
    
    // 检查第一个参数（通常是字符串）
    const firstArg = args[0];
    if (typeof firstArg === 'string') {
      return firstArg.includes('findDOMNode is deprecated') ||
             firstArg.includes('findDOMNode was passed');
    }
    
    // 检查所有参数中是否包含相关文本
    return args.some(arg => {
      if (typeof arg === 'string') {
        return arg.includes('findDOMNode');
      }
      return false;
    });
  };

  // 抑制 findDOMNode 废弃警告（来自 Ant Design）
  console.error = (...args) => {
    if (isFindDOMNodeWarning(args)) {
      return;
    }
    originalError.apply(console, args);
  };

  console.warn = (...args) => {
    if (isFindDOMNodeWarning(args)) {
      return;
    }
    originalWarn.apply(console, args);
  };
}

