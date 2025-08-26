import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const ToastContext = createContext();

// Toast ID generator
let toastId = 0;
const generateToastId = () => `toast_${++toastId}_${Date.now()}`;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  // Add a new toast
  const addToast = useCallback((toastData) => {
    const id = generateToastId();
    const toast = {
      id,
      type: "info",
      duration: 5000,
      ...toastData,
    };

    setToasts((prev) => [...prev, toast]);
    return id;
  }, []);

  // Remove a toast by ID
  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Clear all toasts
  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods for different toast types
  const showSuccess = useCallback(
    (message, options = {}) => {
      return addToast({
        type: "success",
        title: options.title || "Thành công",
        message,
        ...options,
      });
    },
    [addToast]
  );

  const showError = useCallback(
    (message, options = {}) => {
      return addToast({
        type: "error",
        title: options.title || "Lỗi",
        message,
        duration: options.duration || 8000, // Longer duration for errors
        ...options,
      });
    },
    [addToast]
  );

  const showWarning = useCallback(
    (message, options = {}) => {
      return addToast({
        type: "warning",
        title: options.title || "Cảnh báo",
        message,
        ...options,
      });
    },
    [addToast]
  );

  const showInfo = useCallback(
    (message, options = {}) => {
      return addToast({
        type: "info",
        title: options.title || "Thông tin",
        message,
        ...options,
      });
    },
    [addToast]
  );

  // Network and server error handlers
  const showNetworkError = useCallback(
    (error, options = {}) => {
      const message =
        error?.message ||
        "Không thể kết nối đến server. Vui lòng kiểm tra kết nối mạng.";
      return showError(message, {
        title: "Lỗi kết nối",
        actions: [
          {
            label: "Thử lại",
            style: "primary",
            onClick: options.onRetry || (() => window.location.reload()),
          },
        ],
        ...options,
      });
    },
    [showError]
  );

  const showServerError = useCallback(
    (error, options = {}) => {
      const message =
        error?.message || "Server đang gặp sự cố. Vui lòng thử lại sau.";
      return showError(message, {
        title: "Lỗi server",
        actions: [
          {
            label: "Thử lại",
            style: "primary",
            onClick: options.onRetry || (() => window.location.reload()),
          },
        ],
        ...options,
      });
    },
    [showError]
  );

  const showDatabaseError = useCallback(
    (error, options = {}) => {
      const message =
        error?.message ||
        "Không thể kết nối đến cơ sở dữ liệu. Vui lòng thử lại sau.";
      return showError(message, {
        title: "Lỗi cơ sở dữ liệu",
        duration: 10000, // Longer duration for database errors
        ...options,
      });
    },
    [showError]
  );

  const showWebRTCError = useCallback(
    (error, options = {}) => {
      let message = "Không thể thiết lập kết nối streaming.";

      if (error?.name === "NotAllowedError") {
        message =
          "Vui lòng cho phép truy cập camera và microphone để bắt đầu stream.";
      } else if (error?.name === "NotFoundError") {
        message =
          "Không tìm thấy camera hoặc microphone. Vui lòng kiểm tra thiết bị.";
      } else if (error?.name === "OverconstrainedError") {
        message = "Thiết bị không hỗ trợ chất lượng stream được yêu cầu.";
      } else if (error?.message) {
        message = error.message;
      }

      return showError(message, {
        title: "Lỗi streaming",
        actions: options.onRetry
          ? [
              {
                label: "Thử lại",
                style: "primary",
                onClick: options.onRetry,
              },
            ]
          : undefined,
        ...options,
      });
    },
    [showError]
  );

  const showSocketError = useCallback(
    (error, options = {}) => {
      const message =
        error?.message || "Mất kết nối với server. Đang thử kết nối lại...";
      return showWarning(message, {
        title: "Lỗi kết nối",
        duration: 6000,
        ...options,
      });
    },
    [showWarning]
  );

  // Context value
  const contextValue = useMemo(
    () => ({
      toasts,
      addToast,
      removeToast,
      clearToasts,
      showSuccess,
      showError,
      showWarning,
      showInfo,
      showNetworkError,
      showServerError,
      showDatabaseError,
      showWebRTCError,
      showSocketError,
    }),
    [
      toasts,
      addToast,
      removeToast,
      clearToasts,
      showSuccess,
      showError,
      showWarning,
      showInfo,
      showNetworkError,
      showServerError,
      showDatabaseError,
      showWebRTCError,
      showSocketError,
    ]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
    </ToastContext.Provider>
  );
};

// Custom hook to use toast context
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export default ToastContext;
