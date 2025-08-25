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

// Media constraints - optimized for compatibility and performance
export const MEDIA_CONSTRAINTS = {
  video: {
    width: { ideal: 640, min: 320, max: 1280 },
    height: { ideal: 480, min: 240, max: 720 },
    frameRate: { ideal: 15, min: 10, max: 30 },
    facingMode: "user",
    // Add compatibility settings
    aspectRatio: { ideal: 4/3, min: 1.33, max: 1.78 }
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    // More conservative sample rate for compatibility
    sampleRate: { ideal: 44100, max: 48000 },
    // Add channel configuration
    channelCount: { ideal: 1, max: 2 }
  },
};

// UI constants
export const MODAL_ANIMATION_DURATION = 300;
export const NOTIFICATION_DURATION = 3000;
