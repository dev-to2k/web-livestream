import { useEffect, useState } from "react";
import styles from "./Toast.module.css";

const Toast = ({
  id,
  type = "info", // info, success, warning, error
  title,
  message,
  duration = 5000, // Auto dismiss after 5 seconds
  onClose,
  actions = [], // Array of action buttons
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onClose?.(id);
    }, 300); // Wait for exit animation
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return "✓";
      case "warning":
        return "⚠";
      case "error":
        return "✕";
      default:
        return "ℹ";
    }
  };

  const toastClasses = [
    styles.toast,
    styles[type],
    isVisible ? styles.visible : "",
    isLeaving ? styles.leaving : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={toastClasses} role="alert" aria-live="polite">
      <div className={styles.toastContent}>
        <div className={styles.toastIcon}>{getIcon()}</div>

        <div className={styles.toastText}>
          {title && <div className={styles.toastTitle}>{title}</div>}
          {message && <div className={styles.toastMessage}>{message}</div>}
        </div>

        {actions.length > 0 && (
          <div className={styles.toastActions}>
            {actions.map((action, index) => (
              <button
                key={index}
                className={`${styles.toastAction} ${
                  styles[action.style] || ""
                }`}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        <button
          className={styles.toastClose}
          onClick={handleClose}
          aria-label="Đóng thông báo"
        >
          ✕
        </button>
      </div>

      {duration > 0 && (
        <div
          className={styles.toastProgress}
          style={{
            animationDuration: `${duration}ms`,
            animationPlayState: isLeaving ? "paused" : "running",
          }}
        />
      )}
    </div>
  );
};

// Toast Container Component
export const ToastContainer = ({ toasts, onClose }) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className={styles.toastContainer}>
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={onClose} />
      ))}
    </div>
  );
};

export default Toast;
