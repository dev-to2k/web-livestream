const mongoose = require('mongoose');

// Room Schema with sharding support
const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  streamer: {
    id: String,
    username: String,
    startTime: {
      type: Date,
      default: Date.now
    },
    connectionState: {
      type: String,
      enum: ['active', 'disconnected', 'reconnecting'],
      default: 'active'
    }
  },
  settings: {
    autoAccept: {
      type: Boolean,
      default: true
    },
    maxViewers: {
      type: Number,
      default: 1000
    },
    isPrivate: {
      type: Boolean,
      default: false
    }
  },
  streamStats: {
    totalViewers: {
      type: Number,
      default: 0
    },
    currentViewers: {
      type: Number,
      default: 0
    },
    peakViewers: {
      type: Number,
      default: 0
    },
    startTime: {
      type: Date,
      default: Date.now
    },
    endTime: Date,
    duration: Number,
    totalMessages: {
      type: Number,
      default: 0
    }
  },
  status: {
    type: String,
    enum: ['active', 'ended', 'paused'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Auto-delete after 24 hours
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
roomSchema.index({ roomId: 1 });
roomSchema.index({ status: 1, createdAt: -1 });
roomSchema.index({ 'streamer.id': 1 });
roomSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

// User Schema
const userSchema = new mongoose.Schema({
  socketId: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  roomId: {
    type: String,
    required: true,
    index: true
  },
  isStreamer: {
    type: Boolean,
    default: false
  },
  isPending: {
    type: Boolean,
    default: false
  },
  connectionInfo: {
    serverId: String,
    lastSeen: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String,
    connectionQuality: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good'
    }
  },
  permissions: {
    canChat: {
      type: Boolean,
      default: true
    },
    canViewStream: {
      type: Boolean,
      default: true
    },
    isModerator: {
      type: Boolean,
      default: false
    }
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Auto-delete after 24 hours
  }
}, {
  timestamps: true
});

// Indexes for user queries
userSchema.index({ socketId: 1 });
userSchema.index({ roomId: 1, isStreamer: -1 });
userSchema.index({ roomId: 1, isPending: 1 });
userSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

// Message Schema with optimized storage
const messageSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true,
    maxlength: 50
  },
  message: {
    type: String,
    required: true,
    maxlength: 500,
    trim: true
  },
  messageType: {
    type: String,
    enum: ['chat', 'system', 'user-joined', 'user-left'],
    default: 'chat'
  },
  metadata: {
    isStreamer: Boolean,
    isModerator: Boolean,
    serverId: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false // Using custom timestamp field
});

// Indexes for message queries
messageSchema.index({ roomId: 1, timestamp: -1 });
messageSchema.index({ userId: 1, timestamp: -1 });
messageSchema.index({ timestamp: 1 }, { expireAfterSeconds: 86400 }); // Auto-delete after 24 hours

// Connection State Schema for tracking WebRTC connections
const connectionStateSchema = new mongoose.Schema({
  socketId: {
    type: String,
    required: true,
    unique: true
  },
  roomId: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['streamer', 'viewer'],
    required: true
  },
  serverId: {
    type: String,
    required: true
  },
  connectionDetails: {
    status: {
      type: String,
      enum: ['connecting', 'connected', 'reconnecting', 'disconnected', 'failed'],
      default: 'connecting'
    },
    offerSent: Boolean,
    answerSent: Boolean,
    iceCandidatesSent: {
      type: Number,
      default: 0
    },
    lastOfferTime: Date,
    lastAnswerTime: Date,
    lastIceCandidateTime: Date,
    lastHealthUpdate: Date,
    connectedViewers: {
      type: Number,
      default: 0
    }
  },
  healthMetrics: {
    latency: Number,
    bandwidth: Number,
    packetLoss: Number,
    jitter: Number,
    connectionType: String
  },
  lastUpdate: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600 // Auto-delete after 1 hour
  }
}, {
  timestamps: true
});

// Indexes for connection state queries
connectionStateSchema.index({ socketId: 1 });
connectionStateSchema.index({ roomId: 1, role: 1 });
connectionStateSchema.index({ serverId: 1 });
connectionStateSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

// Room Analytics Schema for historical data
const roomAnalyticsSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  metrics: {
    uniqueViewers: Number,
    peakConcurrentViewers: Number,
    averageViewDuration: Number,
    totalMessages: Number,
    streamDuration: Number,
    bounceRate: Number,
    engagementRate: Number
  },
  hourlyStats: [{
    hour: Number,
    viewers: Number,
    messages: Number,
    joinEvents: Number,
    leaveEvents: Number
  }]
}, {
  timestamps: true
});

// Indexes for analytics
roomAnalyticsSchema.index({ roomId: 1, date: -1 });
roomAnalyticsSchema.index({ date: -1 });

// Create models
const Room = mongoose.model('Room', roomSchema);
const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);
const ConnectionState = mongoose.model('ConnectionState', connectionStateSchema);
const RoomAnalytics = mongoose.model('RoomAnalytics', roomAnalyticsSchema);

// Helper methods for sharding
const getShardKey = (roomId) => {
  // Simple hash-based sharding
  const hash = roomId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  return Math.abs(hash) % 3; // 3 shards
};

module.exports = {
  Room,
  User,
  Message,
  ConnectionState,
  RoomAnalytics,
  getShardKey
};