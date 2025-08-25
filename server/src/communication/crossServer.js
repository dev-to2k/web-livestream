const EventEmitter = require('events');

class CrossServerCommunication extends EventEmitter {
  constructor(redisManager, serverId) {
    super();
    this.redis = redisManager;
    this.serverId = serverId;
    this.subscriptions = new Map();
    this.messageHandlers = new Map();
    
    // Channel patterns for different message types
    this.channels = {
      ROOM_EVENTS: 'room:events',
      USER_EVENTS: 'user:events', 
      WEBRTC_SIGNALING: 'webrtc:signaling',
      CHAT_MESSAGES: 'chat:messages',
      SYSTEM_EVENTS: 'system:events',
      HEALTH_CHECKS: 'health:checks',
      LOAD_BALANCING: 'loadbalance:events'
    };
    
    this.setupMessageHandlers();
  }

  async initialize() {
    try {
      console.log('🔗 CROSS-SERVER: Initializing cross-server communication');
      
      // Subscribe to all relevant channels
      await this.subscribeToChannels();
      
      // Start health check broadcasting
      this.startHealthCheckBroadcast();
      
      console.log('✅ CROSS-SERVER: Cross-server communication initialized');
      return true;
    } catch (error) {
      console.error('❌ CROSS-SERVER: Failed to initialize:', error);
      return false;
    }
  }

  async subscribeToChannels() {
    const channelSubscriptions = [
      { channel: this.channels.ROOM_EVENTS, handler: this.handleRoomEvent.bind(this) },
      { channel: this.channels.USER_EVENTS, handler: this.handleUserEvent.bind(this) },
      { channel: this.channels.WEBRTC_SIGNALING, handler: this.handleWebRTCSignaling.bind(this) },
      { channel: this.channels.CHAT_MESSAGES, handler: this.handleChatMessage.bind(this) },
      { channel: this.channels.SYSTEM_EVENTS, handler: this.handleSystemEvent.bind(this) },
      { channel: this.channels.HEALTH_CHECKS, handler: this.handleHealthCheck.bind(this) },
      { channel: this.channels.LOAD_BALANCING, handler: this.handleLoadBalanceEvent.bind(this) }
    ];

    for (const { channel, handler } of channelSubscriptions) {
      await this.redis.subscribe(channel, handler);
      this.subscriptions.set(channel, handler);
      console.log(`🔗 CROSS-SERVER: Subscribed to ${channel}`);
    }
  }

  setupMessageHandlers() {
    // Define message type handlers
    this.messageHandlers.set('room:created', this.onRoomCreated.bind(this));
    this.messageHandlers.set('room:destroyed', this.onRoomDestroyed.bind(this));
    this.messageHandlers.set('room:updated', this.onRoomUpdated.bind(this));
    this.messageHandlers.set('user:joined', this.onUserJoined.bind(this));
    this.messageHandlers.set('user:left', this.onUserLeft.bind(this));
    this.messageHandlers.set('streamer:started', this.onStreamerStarted.bind(this));
    this.messageHandlers.set('streamer:ended', this.onStreamerEnded.bind(this));
    this.messageHandlers.set('webrtc:offer', this.onWebRTCOffer.bind(this));
    this.messageHandlers.set('webrtc:answer', this.onWebRTCAnswer.bind(this));
    this.messageHandlers.set('webrtc:ice-candidate', this.onWebRTCIceCandidate.bind(this));
    this.messageHandlers.set('chat:message', this.onChatMessage.bind(this));
    this.messageHandlers.set('system:server-started', this.onServerStarted.bind(this));
    this.messageHandlers.set('system:server-stopped', this.onServerStopped.bind(this));
    this.messageHandlers.set('system:scale-up', this.onScaleUp.bind(this));
    this.messageHandlers.set('system:scale-down', this.onScaleDown.bind(this));
  }

  // Broadcasting methods
  async broadcastRoomEvent(eventType, roomId, data) {
    const message = {
      type: `room:${eventType}`,
      roomId,
      serverId: this.serverId,
      timestamp: Date.now(),
      data
    };

    return await this.redis.publish(this.channels.ROOM_EVENTS, message);
  }

  async broadcastUserEvent(eventType, userId, roomId, data) {
    const message = {
      type: `user:${eventType}`,
      userId,
      roomId,
      serverId: this.serverId,
      timestamp: Date.now(),
      data
    };

    return await this.redis.publish(this.channels.USER_EVENTS, message);
  }

  async broadcastWebRTCSignaling(signalType, fromUserId, toUserId, roomId, data) {
    const message = {
      type: `webrtc:${signalType}`,
      fromUserId,
      toUserId,
      roomId,
      serverId: this.serverId,
      timestamp: Date.now(),
      data
    };

    return await this.redis.publish(this.channels.WEBRTC_SIGNALING, message);
  }

  async broadcastChatMessage(roomId, message, userId, username) {
    const chatData = {
      type: 'chat:message',
      roomId,
      userId,
      username,
      message,
      serverId: this.serverId,
      timestamp: Date.now()
    };

    return await this.redis.publish(this.channels.CHAT_MESSAGES, chatData);
  }

  async broadcastSystemEvent(eventType, data) {
    const message = {
      type: `system:${eventType}`,
      serverId: this.serverId,
      timestamp: Date.now(),
      data
    };

    return await this.redis.publish(this.channels.SYSTEM_EVENTS, message);
  }

  // Message handlers
  handleRoomEvent(data, channel, metadata) {
    try {
      if (data.serverId === this.serverId) {
        return; // Ignore own messages
      }

      const handler = this.messageHandlers.get(data.type);
      if (handler) {
        handler(data);
      } else {
        console.warn(`🔗 CROSS-SERVER: Unknown room event type: ${data.type}`);
      }
    } catch (error) {
      console.error('❌ CROSS-SERVER: Error handling room event:', error);
    }
  }

  handleUserEvent(data, channel, metadata) {
    try {
      if (data.serverId === this.serverId) {
        return; // Ignore own messages
      }

      const handler = this.messageHandlers.get(data.type);
      if (handler) {
        handler(data);
      } else {
        console.warn(`🔗 CROSS-SERVER: Unknown user event type: ${data.type}`);
      }
    } catch (error) {
      console.error('❌ CROSS-SERVER: Error handling user event:', error);
    }
  }

  handleWebRTCSignaling(data, channel, metadata) {
    try {
      if (data.serverId === this.serverId) {
        return; // Ignore own messages
      }

      const handler = this.messageHandlers.get(data.type);
      if (handler) {
        handler(data);
      } else {
        console.warn(`🔗 CROSS-SERVER: Unknown WebRTC event type: ${data.type}`);
      }
    } catch (error) {
      console.error('❌ CROSS-SERVER: Error handling WebRTC signaling:', error);
    }
  }

  handleChatMessage(data, channel, metadata) {
    try {
      if (data.serverId === this.serverId) {
        return; // Ignore own messages
      }

      const handler = this.messageHandlers.get(data.type);
      if (handler) {
        handler(data);
      }
    } catch (error) {
      console.error('❌ CROSS-SERVER: Error handling chat message:', error);
    }
  }

  handleSystemEvent(data, channel, metadata) {
    try {
      if (data.serverId === this.serverId) {
        return; // Ignore own messages
      }

      const handler = this.messageHandlers.get(data.type);
      if (handler) {
        handler(data);
      } else {
        console.warn(`🔗 CROSS-SERVER: Unknown system event type: ${data.type}`);
      }
    } catch (error) {
      console.error('❌ CROSS-SERVER: Error handling system event:', error);
    }
  }

  handleHealthCheck(data, channel, metadata) {
    try {
      if (data.serverId === this.serverId) {
        return; // Ignore own health checks
      }

      this.emit('server:health-check', data);
    } catch (error) {
      console.error('❌ CROSS-SERVER: Error handling health check:', error);
    }
  }

  handleLoadBalanceEvent(data, channel, metadata) {
    try {
      this.emit('loadbalance:event', data);
    } catch (error) {
      console.error('❌ CROSS-SERVER: Error handling load balance event:', error);
    }
  }

  // Event handlers that emit to the main server
  onRoomCreated(data) {
    console.log(`🏠 CROSS-SERVER: Room created on ${data.serverId}: ${data.roomId}`);
    this.emit('room:created', data);
  }

  onRoomDestroyed(data) {
    console.log(`🏠 CROSS-SERVER: Room destroyed on ${data.serverId}: ${data.roomId}`);
    this.emit('room:destroyed', data);
  }

  onRoomUpdated(data) {
    console.log(`🏠 CROSS-SERVER: Room updated on ${data.serverId}: ${data.roomId}`);
    this.emit('room:updated', data);
  }

  onUserJoined(data) {
    console.log(`👤 CROSS-SERVER: User joined on ${data.serverId}: ${data.userId} -> ${data.roomId}`);
    this.emit('user:joined', data);
  }

  onUserLeft(data) {
    console.log(`👤 CROSS-SERVER: User left on ${data.serverId}: ${data.userId} -> ${data.roomId}`);
    this.emit('user:left', data);
  }

  onStreamerStarted(data) {
    console.log(`🎬 CROSS-SERVER: Streamer started on ${data.serverId}: ${data.roomId}`);
    this.emit('streamer:started', data);
  }

  onStreamerEnded(data) {
    console.log(`🎬 CROSS-SERVER: Streamer ended on ${data.serverId}: ${data.roomId}`);
    this.emit('streamer:ended', data);
  }

  onWebRTCOffer(data) {
    console.log(`🔗 CROSS-SERVER: WebRTC offer from ${data.serverId}: ${data.fromUserId} -> ${data.toUserId}`);
    this.emit('webrtc:offer', data);
  }

  onWebRTCAnswer(data) {
    console.log(`🔗 CROSS-SERVER: WebRTC answer from ${data.serverId}: ${data.fromUserId} -> ${data.toUserId}`);
    this.emit('webrtc:answer', data);
  }

  onWebRTCIceCandidate(data) {
    console.log(`🔗 CROSS-SERVER: ICE candidate from ${data.serverId}: ${data.fromUserId} -> ${data.toUserId}`);
    this.emit('webrtc:ice-candidate', data);
  }

  onChatMessage(data) {
    console.log(`💬 CROSS-SERVER: Chat message from ${data.serverId}: ${data.username} in ${data.roomId}`);
    this.emit('chat:message', data);
  }

  onServerStarted(data) {
    console.log(`🚀 CROSS-SERVER: Server started: ${data.serverId}`);
    this.emit('server:started', data);
  }

  onServerStopped(data) {
    console.log(`🛑 CROSS-SERVER: Server stopped: ${data.serverId}`);
    this.emit('server:stopped', data);
  }

  onScaleUp(data) {
    console.log(`📈 CROSS-SERVER: Scale up event: ${JSON.stringify(data)}`);
    this.emit('system:scale-up', data);
  }

  onScaleDown(data) {
    console.log(`📉 CROSS-SERVER: Scale down event: ${JSON.stringify(data)}`);
    this.emit('system:scale-down', data);
  }

  // Health check broadcasting
  startHealthCheckBroadcast() {
    const broadcastHealth = async () => {
      try {
        const healthData = {
          serverId: this.serverId,
          timestamp: Date.now(),
          status: 'healthy',
          connections: this.getConnectionCount?.() || 0,
          rooms: this.getRoomCount?.() || 0,
          memory: process.memoryUsage(),
          uptime: process.uptime()
        };

        await this.redis.publish(this.channels.HEALTH_CHECKS, healthData);
      } catch (error) {
        console.error('❌ CROSS-SERVER: Error broadcasting health check:', error);
      }
    };

    // Broadcast health every 30 seconds
    this.healthCheckInterval = setInterval(broadcastHealth, 30000);
    
    // Initial broadcast
    broadcastHealth();
  }

  // Server discovery methods
  async getActiveServers() {
    try {
      // Get list of servers that have sent health checks in the last 2 minutes
      const cutoffTime = Date.now() - (2 * 60 * 1000);
      const servers = await this.redis.get('active_servers') || {};
      
      const activeServers = Object.entries(servers)
        .filter(([serverId, data]) => data.timestamp > cutoffTime)
        .map(([serverId, data]) => ({
          serverId,
          ...data
        }));

      return activeServers;
    } catch (error) {
      console.error('❌ CROSS-SERVER: Error getting active servers:', error);
      return [];
    }
  }

  async findServerForRoom(roomId) {
    try {
      // Use consistent hashing to find the appropriate server
      const activeServers = await this.getActiveServers();
      
      if (activeServers.length === 0) {
        return null;
      }

      // Simple consistent hashing
      const hash = this.hashRoomId(roomId);
      const serverIndex = hash % activeServers.length;
      
      return activeServers[serverIndex];
    } catch (error) {
      console.error('❌ CROSS-SERVER: Error finding server for room:', error);
      return null;
    }
  }

  hashRoomId(roomId) {
    let hash = 0;
    for (let i = 0; i < roomId.length; i++) {
      const char = roomId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // Load balancing methods
  async requestLoadBalance() {
    const loadData = {
      serverId: this.serverId,
      timestamp: Date.now(),
      connections: this.getConnectionCount?.() || 0,
      rooms: this.getRoomCount?.() || 0,
      cpu: process.cpuUsage(),
      memory: process.memoryUsage()
    };

    await this.redis.publish(this.channels.LOAD_BALANCING, {
      type: 'load:status',
      ...loadData
    });
  }

  async requestScaleUp(reason) {
    await this.broadcastSystemEvent('scale-up', {
      reason,
      requestedBy: this.serverId,
      currentLoad: {
        connections: this.getConnectionCount?.() || 0,
        rooms: this.getRoomCount?.() || 0
      }
    });
  }

  async requestScaleDown(reason) {
    await this.broadcastSystemEvent('scale-down', {
      reason,
      requestedBy: this.serverId,
      currentLoad: {
        connections: this.getConnectionCount?.() || 0,
        rooms: this.getRoomCount?.() || 0
      }
    });
  }

  // Utility methods to be called by the main server
  setConnectionCounter(fn) {
    this.getConnectionCount = fn;
  }

  setRoomCounter(fn) {
    this.getRoomCount = fn;
  }

  // Cleanup
  async shutdown() {
    console.log('🔗 CROSS-SERVER: Shutting down cross-server communication');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Broadcast server stopping
    await this.broadcastSystemEvent('server-stopped', {
      reason: 'shutdown',
      finalStats: {
        connections: this.getConnectionCount?.() || 0,
        rooms: this.getRoomCount?.() || 0,
        uptime: process.uptime()
      }
    });

    // Unsubscribe from all channels
    for (const [channel, handler] of this.subscriptions) {
      await this.redis.unsubscribe(channel);
    }

    console.log('✅ CROSS-SERVER: Cross-server communication shutdown complete');
  }
}

module.exports = CrossServerCommunication;