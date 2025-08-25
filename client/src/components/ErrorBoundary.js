import React from 'react';
import styles from './ErrorBoundary.module.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('🔴 ErrorBoundary: Caught error:', error);
    console.error('🔴 ErrorBoundary: Error info:', errorInfo);
    
    this.setState({
      error,
      errorInfo,
      hasError: true
    });

    // Report error to logging service in production
    if (process.env.NODE_ENV === 'production') {
      this.reportError(error, errorInfo);
    }
  }

  reportError = (error, errorInfo) => {
    // In production, send error to logging service
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    console.log('📊 Error Report:', errorReport);
    // TODO: Send to logging service
  };

  handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1
    }));
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, retryCount } = this.state;
      const maxRetries = 3;
      
      return (
        <div className={styles.errorBoundary}>
          <div className={styles.errorBoundaryContent}>
            <div className={styles.errorIcon}>⚠️</div>
            <h2>Oops! Có lỗi xảy ra</h2>
            <p className={styles.errorMessage}>
              Ứng dụng gặp sự cố không mong muốn. Chúng tôi đã ghi nhận lỗi này.
            </p>
            
            <div className={styles.errorActions}>
              {retryCount < maxRetries ? (
                <button 
                  className="btn btn-primary" 
                  onClick={this.handleRetry}
                >
                  Thử lại ({maxRetries - retryCount} lần còn lại)
                </button>
              ) : (
                <button 
                  className="btn btn-secondary" 
                  onClick={this.handleReload}
                >
                  Tải lại trang
                </button>
              )}
            </div>
            
            {process.env.NODE_ENV === 'development' && (
              <details className={styles.errorDetails}>
                <summary>Chi tiết lỗi (Development)</summary>
                <div className={styles.errorStack}>
                  <h4>Error:</h4>
                  <pre>{error && error.toString()}</pre>
                  <h4>Component Stack:</h4>
                  <pre>{errorInfo.componentStack}</pre>
                  <h4>Error Stack:</h4>
                  <pre>{error && error.stack}</pre>
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;