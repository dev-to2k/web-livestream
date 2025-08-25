import React from 'react';
import { createUserFriendlyError } from '../utils/streamErrors';
import Spinner from './UI/Spinner';
import styles from './StreamErrorDisplay.module.css';

const StreamErrorDisplay = ({ 
  error, 
  onRetry, 
  onDismiss, 
  isRetrying = false,
  retryCount = 0,
  maxRetries = 3
}) => {
  if (!error) return null;

  const friendlyError = typeof error === 'object' && error.type 
    ? error 
    : createUserFriendlyError(error);

  const canRetry = friendlyError.canRetry && retryCount < maxRetries;
  const showGuidance = friendlyError.guidance && friendlyError.guidance.length > 0;

  return (
    <div className={styles.streamError}>
      <div className={styles.errorHeader}>
        <span className={styles.errorIcon}>❌</span>
        <h4 className={styles.errorTitle}>Lỗi Streaming</h4>
      </div>
      
      <div className={styles.errorMessage}>
        {friendlyError.message}
      </div>
      
      {showGuidance && (
        <div className={styles.errorGuidance}>
          <h5>Hướng dẫn khắc phục:</h5>
          <ol>
            {friendlyError.guidance.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      
      <div className={styles.errorActions}>
        {canRetry && (
          <button 
            className={styles.retryBtn}
            onClick={onRetry}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <>
                <Spinner size="small" />
                Đang thử lại...
              </>
            ) : (
              `Thử lại (${maxRetries - retryCount} lần còn lại)`
            )}
          </button>
        )}
        
        {onDismiss && (
          <button 
            className={styles.dismissBtn}
            onClick={onDismiss}
          >
            Đóng
          </button>
        )}
        
        {!canRetry && (
          <button 
            className={styles.reloadBtn}
            onClick={() => window.location.reload()}
          >
            Tải lại trang
          </button>
        )}
      </div>
      
      {friendlyError.nextSteps && (
        <div className={styles.errorNextSteps}>
          <small>
            <strong>Bước tiếp theo:</strong> {friendlyError.nextSteps}
          </small>
        </div>
      )}
      
      {process.env.NODE_ENV === 'development' && friendlyError.originalError && (
        <details className={styles.errorDebug}>
          <summary>Debug Info</summary>
          <pre>{JSON.stringify({
            type: friendlyError.type,
            originalMessage: friendlyError.originalError.message,
            timestamp: friendlyError.timestamp,
            context: friendlyError.context
          }, null, 2)}</pre>
        </details>
      )}
    </div>
  );
};

export default StreamErrorDisplay;