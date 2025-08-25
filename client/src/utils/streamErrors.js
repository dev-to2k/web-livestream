// Stream error types and handling utilities

export const StreamErrorTypes = {
  PERMISSION_DENIED: "NotAllowedError",
  DEVICE_NOT_FOUND: "NotFoundError",
  DEVICE_BUSY: "NotReadableError",
  OVERCONSTRAINED: "OverconstrainedError",
  SECURITY_ERROR: "SecurityError",
  NETWORK_ERROR: "NetworkError",
  UNKNOWN: "UnknownError",
};

export const ErrorMessages = {
  [StreamErrorTypes.PERMISSION_DENIED]: {
    message: "Truy cập camera/microphone bị từ chối. Vui lòng cho phép truy cập và thử lại.",
    recoverable: true,
    action: "request_permission",
    userAction: "Nhấp vào biểu tượng camera trong thanh địa chỉ để cho phép truy cập"
  },
  [StreamErrorTypes.DEVICE_NOT_FOUND]: {
    message: "Không tìm thấy camera hoặc microphone. Vui lòng kết nối thiết bị.",
    recoverable: false,
    action: "check_devices",
    userAction: "Kiểm tra kết nối camera/microphone và làm mới trang"
  },
  [StreamErrorTypes.DEVICE_BUSY]: {
    message: "Camera/microphone đang được sử dụng bởi ứng dụng khác.",
    recoverable: true,
    action: "close_other_apps",
    userAction: "Đóng các ứng dụng khác đang sử dụng camera/microphone"
  },
  [StreamErrorTypes.OVERCONSTRAINED]: {
    message: "Cài đặt camera không được hỗ trợ. Đang thử với chất lượng thấp hơn.",
    recoverable: true,
    action: "fallback_constraints",
    userAction: "Hệ thống sẽ tự động thử lại với cài đặt tương thích"
  },
  [StreamErrorTypes.SECURITY_ERROR]: {
    message: "Lỗi bảo mật. Vui lòng đảm bảo trang web được tải qua HTTPS.",
    recoverable: false,
    action: "check_https",
    userAction: "Liên hệ quản trị viên để sử dụng kết nối bảo mật"
  },
  [StreamErrorTypes.NETWORK_ERROR]: {
    message: "Lỗi kết nối mạng. Vui lòng kiểm tra kết nối internet.",
    recoverable: true,
    action: "check_network",
    userAction: "Kiểm tra kết nối internet và thử lại"
  },
};

export const handleStreamError = (error) => {
  console.error("🔴 Stream Error:", error);

  const errorInfo = ErrorMessages[error.name] || {
    message: `Lỗi stream: ${error.message || "Lỗi không xác định"}`,
    recoverable: true,
    action: "retry",
    userAction: "Thử lại hoặc làm mới trang"
  };

  return {
    type: error.name || StreamErrorTypes.UNKNOWN,
    ...errorInfo,
    originalError: error,
    timestamp: new Date().toISOString(),
  };
};

export const getFallbackConstraints = (originalConstraints) => {
  // Fallback to lower quality constraints if original fails
  return {
    video: {
      width: { ideal: 320, max: 640 },
      height: { ideal: 240, max: 480 },
      frameRate: { ideal: 10, max: 15 },
      facingMode: "user",
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
};

export const getBasicConstraints = () => {
  // Most basic constraints for maximum compatibility
  return {
    video: true,
    audio: true,
  };
};

export const createRetryStrategy = (maxRetries = 3) => {
  let retryCount = 0;
  
  return {
    shouldRetry: (error) => {
      const errorInfo = ErrorMessages[error.name];
      return retryCount < maxRetries && errorInfo?.recoverable;
    },
    
    getNextAttempt: () => {
      retryCount++;
      
      if (retryCount === 1) {
        return { constraints: getFallbackConstraints(), delay: 1000 };
      } else if (retryCount === 2) {
        return { constraints: getBasicConstraints(), delay: 2000 };
      }
      
      return null;
    },
    
    reset: () => {
      retryCount = 0;
    }
  };
};