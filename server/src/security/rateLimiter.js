/**
 * Comprehensive Rate Limiting System
 * 
 * Implements tiered rate limiting based on user types with:
 * - Per-user rate limiting
 * - Per-IP rate limiting  
 * - Message type specific limits
 * - Adaptive throttling
 * - DDoS protection
 * - Burst allowances
 */

const EventEmitter = require('events');

class RateLimiter extends EventEmitter {
  constructor(redisClient, options = {}) {
    super();
    
    this.redis = redisClient;
    this.config = {
      // Rate limiting windows (in seconds)
      windows: {
        short: 1,      // 1 second
        medium: 60,    // 1 minute  
        long: 3600     // 1 hour
      },
      
      // User type configurations
      userTypes: {
        anonymous: {
          messagesPerSecond: 2,
          messagesPerMinute: 60,
          messagesPerHour: 500,
          maxConnections: 1,
          burstAllowance: 5,
          strictMode: true
        },
        viewer: {
          messagesPerSecond: 5,
          messagesPerMinute: 200,
          messagesPerHour: 2000,
          maxConnections: 3,
          burstAllowance: 10,
          strictMode: false
        },
        premium_viewer: {
          messagesPerSecond: 10,
          messagesPerMinute: 400,
          messagesPerHour: 5000,
          maxConnections: 10,
          burstAllowance: 20,
          strictMode: false
        },
        streamer: {
          messagesPerSecond: 50,
          messagesPerMinute: 1000,
          messagesPerHour: 20000,
          maxConnections: 1,
          burstAllowance: 100,
          strictMode: false
        },
        moderator: {
          messagesPerSecond: 25,
          messagesPerMinute: 800,
          messagesPerHour: 10000,
          maxConnections: 5,
          burstAllowance: 50,
          strictMode: false
        }
      },
      
      // Message type specific limits
      messageTypeLimits: {
        'chat-message': { weight: 1.0, cooldown: 0 },
        'ice-candidate': { weight: 0.1, cooldown: 0 },
        'offer': { weight: 5.0, cooldown: 1000 },
        'answer': { weight: 5.0, cooldown: 1000 },
        'join-room': { weight: 10.0, cooldown: 5000 },
        'stream-started': { weight: 15.0, cooldown: 10000 },
        'user-status': { weight: 0.5, cooldown: 100 }
      },
      
      // IP-based rate limiting
      ipLimits: {
        connectionsPerMinute: 10,
        messagesPerMinute: 1000,
        suspiciousThreshold: 100, // Messages/min that triggers investigation
        banThreshold: 500, // Messages/min that triggers temporary ban
        banDuration: 300 // 5 minutes
      },
      
      // Adaptive throttling
      adaptiveThrottling: {
        enabled: true,
        cpuThreshold: 80, // CPU % that triggers throttling
        memoryThreshold: 85, // Memory % that triggers throttling
        connectionThreshold: 900, // Connection count that triggers throttling
        throttleMultiplier: 0.5 // Reduce limits by 50% when throttling
      },
      
      ...options
    };
    
    // In-memory tracking for performance
    this.userTracking = new Map(); // userId -> rate info
    this.ipTracking = new Map(); // ip -> rate info
    this.bannedIps = new Set();
    this.suspiciousIps = new Set();
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      adaptiveThrottleCount: 0,
      ipBansIssued: 0,
      burstAllowancesUsed: 0,
      averageResponseTime: 0
    };
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute
    
    console.log('🛡️ RATE_LIMIT: Rate limiter initialized');
  }

  /**
   * Check if request is allowed for user
   */
  async checkUserLimit(userId, userType, messageType, metadata = {}) {
    const startTime = Date.now();
    this.stats.totalRequests++;
    
    try {
      // Check if IP is banned
      const clientIp = metadata.ip;
      if (clientIp && this.bannedIps.has(clientIp)) {
        this.stats.blockedRequests++;
        return this.createDenialResponse('IP_BANNED', 'IP address is temporarily banned');
      }
      
      // Get user configuration
      const userConfig = this.config.userTypes[userType] || this.config.userTypes.anonymous;
      
      // Apply adaptive throttling if needed
      const throttleMultiplier = await this.getThrottleMultiplier();
      const effectiveConfig = this.applyThrottling(userConfig, throttleMultiplier);
      
      // Get message type configuration
      const messageConfig = this.config.messageTypeLimits[messageType] || { weight: 1.0, cooldown: 0 };
      
      // Check various limits
      const checks = await Promise.all([
        this.checkUserRateLimit(userId, effectiveConfig, messageConfig),
        this.checkIPRateLimit(clientIp, metadata),
        this.checkMessageTypeCooldown(userId, messageType, messageConfig.cooldown),
        this.checkBurstAllowance(userId, userConfig, messageConfig)
      ]);
      
      // If any check fails, deny the request
      for (const check of checks) {
        if (!check.allowed) {
          this.stats.blockedRequests++;
          return check;
        }
      }
      
      // Update tracking
      await this.updateTracking(userId, userType, messageType, messageConfig, clientIp);
      
      // Update response time stats
      const responseTime = Date.now() - startTime;
      this.stats.averageResponseTime = (this.stats.averageResponseTime * 0.9) + (responseTime * 0.1);
      
      return this.createAllowedResponse();
      
    } catch (error) {
      console.error('❌ RATE_LIMIT: Error checking user limit:', error);
      // In case of error, allow the request but log it
      return this.createAllowedResponse();
    }
  }

  /**
   * Check user-specific rate limits
   */
  async checkUserRateLimit(userId, userConfig, messageConfig) {
    const userKey = `rate_limit:user:${userId}`;
    const now = Math.floor(Date.now() / 1000);
    
    // Calculate weighted message count
    const messageWeight = messageConfig.weight;
    
    // Check short term limit (per second)
    const shortCount = await this.getCount(userKey, 'short', now);
    if (shortCount + messageWeight > userConfig.messagesPerSecond) {
      return this.createDenialResponse('RATE_LIMIT_EXCEEDED', 
        `Rate limit exceeded: ${userConfig.messagesPerSecond}/sec`);
    }
    
    // Check medium term limit (per minute)
    const mediumCount = await this.getCount(userKey, 'medium', now);
    if (mediumCount + messageWeight > userConfig.messagesPerMinute) {
      return this.createDenialResponse('RATE_LIMIT_EXCEEDED', 
        `Rate limit exceeded: ${userConfig.messagesPerMinute}/min`);
    }
    
    // Check long term limit (per hour)
    const longCount = await this.getCount(userKey, 'long', now);
    if (longCount + messageWeight > userConfig.messagesPerHour) {
      return this.createDenialResponse('RATE_LIMIT_EXCEEDED', 
        `Rate limit exceeded: ${userConfig.messagesPerHour}/hour`);
    }
    
    return { allowed: true };
  }

  /**
   * Check IP-based rate limits
   */
  async checkIPRateLimit(ip, metadata) {
    if (!ip) return { allowed: true };
    
    const ipKey = `rate_limit:ip:${ip}`;
    const now = Math.floor(Date.now() / 1000);
    
    // Check connections per minute
    const connectionCount = await this.getCount(ipKey, 'connections', now);
    if (connectionCount > this.config.ipLimits.connectionsPerMinute) {
      return this.createDenialResponse('IP_RATE_LIMIT', 'Too many connections from IP');
    }
    
    // Check messages per minute
    const messageCount = await this.getCount(ipKey, 'messages', now);
    
    // Check for suspicious activity
    if (messageCount > this.config.ipLimits.suspiciousThreshold) {
      this.suspiciousIps.add(ip);
      this.emit('suspicious-activity', { ip, messageCount, metadata });
    }
    
    // Check for ban threshold
    if (messageCount > this.config.ipLimits.banThreshold) {
      await this.banIP(ip, this.config.ipLimits.banDuration);
      return this.createDenialResponse('IP_BANNED', 'IP temporarily banned for excessive requests');
    }
    
    if (messageCount > this.config.ipLimits.messagesPerMinute) {
      return this.createDenialResponse('IP_RATE_LIMIT', 'IP rate limit exceeded');
    }
    
    return { allowed: true };
  }

  /**
   * Check message type specific cooldowns
   */
  async checkMessageTypeCooldown(userId, messageType, cooldown) {
    if (cooldown === 0) return { allowed: true };
    
    const cooldownKey = `cooldown:${userId}:${messageType}`;
    const lastUsed = await this.redis.get(cooldownKey);
    
    if (lastUsed) {
      const timeSinceLastUse = Date.now() - parseInt(lastUsed);
      if (timeSinceLastUse < cooldown) {
        return this.createDenialResponse('COOLDOWN_ACTIVE', 
          `Cooldown active for ${messageType}: ${cooldown - timeSinceLastUse}ms remaining`);
      }
    }
    
    return { allowed: true };
  }

  /**
   * Check burst allowance for legitimate users
   */
  async checkBurstAllowance(userId, userConfig, messageConfig) {
    // Skip burst check for high-weight messages
    if (messageConfig.weight > 5.0) {
      return { allowed: true };
    }
    
    const burstKey = `burst:${userId}`;
    const burstData = await this.redis.get(burstKey);
    
    if (!burstData) {
      // First message, initialize burst allowance
      await this.redis.setex(burstKey, 60, JSON.stringify({
        remaining: userConfig.burstAllowance - 1,
        resetTime: Date.now() + 60000
      }));
      return { allowed: true };
    }
    
    const burst = JSON.parse(burstData);
    
    // Reset burst allowance if time window expired
    if (Date.now() > burst.resetTime) {
      await this.redis.setex(burstKey, 60, JSON.stringify({
        remaining: userConfig.burstAllowance - 1,
        resetTime: Date.now() + 60000
      }));
      return { allowed: true };
    }
    
    // Check if burst allowance available
    if (burst.remaining <= 0) {
      return { allowed: true }; // Let regular rate limiting handle it
    }
    
    // Use burst allowance
    burst.remaining--;
    await this.redis.setex(burstKey, Math.ceil((burst.resetTime - Date.now()) / 1000), 
      JSON.stringify(burst));
    
    this.stats.burstAllowancesUsed++;
    return { allowed: true, burstUsed: true };
  }

  /**
   * Get count for specific time window
   */
  async getCount(baseKey, window, now) {
    const windowSize = this.config.windows[window] || 60;
    const windowKey = `${baseKey}:${window}:${Math.floor(now / windowSize)}`;
    
    const count = await this.redis.get(windowKey);
    return parseFloat(count) || 0;
  }

  /**
   * Update tracking after successful check
   */
  async updateTracking(userId, userType, messageType, messageConfig, clientIp) {
    const now = Math.floor(Date.now() / 1000);
    const messageWeight = messageConfig.weight;
    
    // Update user tracking
    const userKey = `rate_limit:user:${userId}`;
    await this.incrementCount(userKey, 'short', now, messageWeight);
    await this.incrementCount(userKey, 'medium', now, messageWeight);
    await this.incrementCount(userKey, 'long', now, messageWeight);
    
    // Update IP tracking
    if (clientIp) {
      const ipKey = `rate_limit:ip:${clientIp}`;
      await this.incrementCount(ipKey, 'messages', now, 1);
      
      // Track connections if it's a connection-type message
      if (messageType === 'join-room' || messageType === 'connect') {
        await this.incrementCount(ipKey, 'connections', now, 1);
      }
    }
    
    // Update message type cooldown
    if (messageConfig.cooldown > 0) {
      const cooldownKey = `cooldown:${userId}:${messageType}`;
      await this.redis.setex(cooldownKey, Math.ceil(messageConfig.cooldown / 1000), Date.now().toString());
    }
    
    // Update in-memory tracking for analytics
    this.updateInMemoryTracking(userId, userType, messageType, clientIp);
  }

  /**
   * Increment count for specific window
   */
  async incrementCount(baseKey, window, now, increment) {
    const windowSize = this.config.windows[window] || 60;
    const windowKey = `${baseKey}:${window}:${Math.floor(now / windowSize)}`;
    
    await this.redis.multi()
      .incrbyfloat(windowKey, increment)
      .expire(windowKey, windowSize * 2) // Keep for 2 windows
      .exec();
  }

  /**
   * Update in-memory tracking for fast access
   */
  updateInMemoryTracking(userId, userType, messageType, clientIp) {
    // Update user tracking
    if (!this.userTracking.has(userId)) {
      this.userTracking.set(userId, {
        userType,
        messageCount: 0,
        lastActivity: Date.now(),
        messageTypes: new Map()
      });
    }
    
    const userTrack = this.userTracking.get(userId);
    userTrack.messageCount++;
    userTrack.lastActivity = Date.now();
    userTrack.messageTypes.set(messageType, (userTrack.messageTypes.get(messageType) || 0) + 1);
    
    // Update IP tracking
    if (clientIp) {
      if (!this.ipTracking.has(clientIp)) {
        this.ipTracking.set(clientIp, {
          messageCount: 0,
          userCount: new Set(),
          lastActivity: Date.now()
        });
      }
      
      const ipTrack = this.ipTracking.get(clientIp);
      ipTrack.messageCount++;
      ipTrack.userCount.add(userId);
      ipTrack.lastActivity = Date.now();
    }
  }

  /**
   * Get throttle multiplier based on system load
   */
  async getThrottleMultiplier() {
    if (!this.config.adaptiveThrottling.enabled) {
      return 1.0;
    }
    
    // Get system metrics
    const memUsage = process.memoryUsage();
    const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    // Simple CPU estimation (this would be better with actual CPU monitoring)
    const cpuPercent = Math.min(process.cpuUsage().user / 1000000 * 100, 100);
    
    // Check thresholds
    const thresholds = this.config.adaptiveThrottling;
    let throttleMultiplier = 1.0;
    
    if (memPercent > thresholds.memoryThreshold || cpuPercent > thresholds.cpuThreshold) {
      throttleMultiplier = thresholds.throttleMultiplier;
      this.stats.adaptiveThrottleCount++;
      
      console.log(`⚠️ RATE_LIMIT: Adaptive throttling activated - CPU: ${cpuPercent.toFixed(1)}%, Memory: ${memPercent.toFixed(1)}%`);
    }
    
    return throttleMultiplier;
  }

  /**
   * Apply throttling to user configuration
   */
  applyThrottling(userConfig, throttleMultiplier) {
    if (throttleMultiplier === 1.0) {
      return userConfig;
    }
    
    return {
      ...userConfig,
      messagesPerSecond: Math.floor(userConfig.messagesPerSecond * throttleMultiplier),
      messagesPerMinute: Math.floor(userConfig.messagesPerMinute * throttleMultiplier),
      messagesPerHour: Math.floor(userConfig.messagesPerHour * throttleMultiplier)
    };
  }

  /**
   * Ban IP address temporarily
   */
  async banIP(ip, duration) {
    this.bannedIps.add(ip);
    this.stats.ipBansIssued++;
    
    // Remove ban after duration
    setTimeout(() => {
      this.bannedIps.delete(ip);
      console.log(`🛡️ RATE_LIMIT: IP ban lifted for ${ip}`);
    }, duration * 1000);
    
    // Store in Redis for persistence across restarts
    await this.redis.setex(`ban:${ip}`, duration, Date.now().toString());
    
    console.log(`🚫 RATE_LIMIT: IP ${ip} banned for ${duration} seconds`);
    this.emit('ip-banned', { ip, duration });
  }

  /**
   * Create denial response
   */
  createDenialResponse(reason, message) {
    return {
      allowed: false,
      reason,
      message,
      timestamp: Date.now()
    };
  }

  /**
   * Create allowed response
   */
  createAllowedResponse() {
    return {
      allowed: true,
      timestamp: Date.now()
    };
  }

  /**
   * Clean up old tracking data
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes
    
    // Clean up user tracking
    for (const [userId, data] of this.userTracking) {
      if (now - data.lastActivity > maxAge) {
        this.userTracking.delete(userId);
      }
    }
    
    // Clean up IP tracking
    for (const [ip, data] of this.ipTracking) {
      if (now - data.lastActivity > maxAge) {
        this.ipTracking.delete(ip);
      }
    }
    
    // Clean up suspicious IPs
    this.suspiciousIps.clear();
    
    console.log(`🧹 RATE_LIMIT: Cleanup completed - Users: ${this.userTracking.size}, IPs: ${this.ipTracking.size}`);
  }

  /**
   * Get rate limiting statistics
   */
  getStats() {
    const blockedPercentage = this.stats.totalRequests > 0 ? 
      ((this.stats.blockedRequests / this.stats.totalRequests) * 100).toFixed(2) : 0;
    
    return {
      ...this.stats,
      blockedPercentage: `${blockedPercentage}%`,
      activeUsers: this.userTracking.size,
      activeIPs: this.ipTracking.size,
      bannedIPs: this.bannedIps.size,
      suspiciousIPs: this.suspiciousIps.size,
      config: this.config,
      averageResponseTimeMs: Math.round(this.stats.averageResponseTime)
    };
  }

  /**
   * Update rate limiting configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️ RATE_LIMIT: Configuration updated');
  }

  /**
   * Get user activity summary
   */
  getUserActivity(userId) {
    const userTrack = this.userTracking.get(userId);
    if (!userTrack) {
      return null;
    }
    
    return {
      userId,
      userType: userTrack.userType,
      totalMessages: userTrack.messageCount,
      lastActivity: userTrack.lastActivity,
      messagesByType: Object.fromEntries(userTrack.messageTypes),
      isActive: (Date.now() - userTrack.lastActivity) < 60000
    };
  }

  /**
   * Get IP activity summary
   */
  getIPActivity(ip) {
    const ipTrack = this.ipTracking.get(ip);
    if (!ipTrack) {
      return null;
    }
    
    return {
      ip,
      totalMessages: ipTrack.messageCount,
      uniqueUsers: ipTrack.userCount.size,
      lastActivity: ipTrack.lastActivity,
      isBanned: this.bannedIps.has(ip),
      isSuspicious: this.suspiciousIps.has(ip)
    };
  }

  /**
   * Manually ban/unban IP
   */
  async manualBanIP(ip, duration = 3600) {
    await this.banIP(ip, duration);
  }

  /**
   * Unban IP
   */
  unbanIP(ip) {
    this.bannedIps.delete(ip);
    this.redis.del(`ban:${ip}`);
    console.log(`🛡️ RATE_LIMIT: IP ${ip} unbanned manually`);
  }

  /**
   * Shutdown cleanup
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    console.log('🛡️ RATE_LIMIT: Rate limiter shutdown');
  }
}

module.exports = RateLimiter;