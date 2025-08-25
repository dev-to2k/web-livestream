// Server configuration
export const SERVER_URL =
  process.env.REACT_APP_SERVER_URL || "http://localhost:5000";

// WebRTC configuration
export const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// Room configuration
export const ROOM_CONFIG = {
  MAX_ROOM_ID_LENGTH: 6,
  MAX_USERNAME_LENGTH: 20,
  MAX_MESSAGE_LENGTH: 200,
};

// Media constraints
export const MEDIA_CONSTRAINTS = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

// UI constants
export const MODAL_ANIMATION_DURATION = 300;
export const NOTIFICATION_DURATION = 3000;
