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
        return { 
          constraints: getFallbackConstraints(), 
          delay: 1000,
          quality: 'low',
          description: 'Retrying with lower quality settings'
        };
      } else if (retryCount === 2) {
        return { 
          constraints: getBasicConstraints(), 
          delay: 2000,
          quality: 'basic',
          description: 'Final attempt with basic constraints'
        };
      }
      
      return null;
    },
    
    reset: () => {
      retryCount = 0;
    },
    
    getCurrentAttempt: () => retryCount,
    getMaxRetries: () => maxRetries
  };
};

// Quality assessment for different constraint levels
export const QualityLevels = {
  HIGH: 'high',
  STANDARD: 'standard', 
  LOW: 'low',
  BASIC: 'basic'
};

// Enhanced constraints for different quality levels
export const getConstraintsByQuality = (quality) => {
  switch (quality) {
    case QualityLevels.HIGH:
      return {
        video: {
          width: { ideal: 1280, min: 640, max: 1920 },
          height: { ideal: 720, min: 480, max: 1080 },
          frameRate: { ideal: 30, min: 15, max: 60 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
      };
    
    case QualityLevels.STANDARD:
      return {
        video: {
          width: { ideal: 640, min: 320, max: 1280 },
          height: { ideal: 480, min: 240, max: 720 },
          frameRate: { ideal: 15, min: 10, max: 30 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        },
      };
      
    case QualityLevels.LOW:
      return getFallbackConstraints();
      
    case QualityLevels.BASIC:
    default:
      return getBasicConstraints();
  }
};

// Enhanced error reporting with user guidance
export const createUserFriendlyError = (error, context = {}) => {
  const errorInfo = handleStreamError(error);
  
  return {
    ...errorInfo,
    context,
    guidance: getErrorGuidance(errorInfo.type),
    canRetry: errorInfo.recoverable,
    nextSteps: getNextSteps(errorInfo.type)
  };
};

const getErrorGuidance = (errorType) => {
  const guidance = {
    [StreamErrorTypes.PERMISSION_DENIED]: [
      "1. Nhấp vào biểu tượng camera trong thanh địa chỉ",
      "2. Chọn 'Cho phép' để cấp quyền truy cập", 
      "3. Làm mới trang và thử lại"
    ],
    [StreamErrorTypes.DEVICE_NOT_FOUND]: [
      "1. Kiểm tra camera/microphone đã được kết nối",
      "2. Thử rút và cắm lại thiết bị",
      "3. Kiểm tra thiết bị có hoạt động với ứng dụng khác không"
    ],
    [StreamErrorTypes.DEVICE_BUSY]: [
      "1. Đóng các ứng dụng khác có thể đang sử dụng camera",
      "2. Kiểm tra các tab trình duyệt khác",
      "3. Khởi động lại trình duyệt nếu cần"
    ]
  };
  
  return guidance[errorType] || [
    "1. Thử làm mới trang",
    "2. Kiểm tra kết nối internet", 
    "3. Liên hệ hỗ trợ nếu vấn đề vẫn tiếp tục"
  ];
};

const getNextSteps = (errorType) => {
  const nextSteps = {
    [StreamErrorTypes.PERMISSION_DENIED]: 'allow_permission',
    [StreamErrorTypes.DEVICE_NOT_FOUND]: 'check_devices',
    [StreamErrorTypes.DEVICE_BUSY]: 'close_other_apps',
    [StreamErrorTypes.OVERCONSTRAINED]: 'retry_with_fallback'
  };
  
  return nextSteps[errorType] || 'retry';
};