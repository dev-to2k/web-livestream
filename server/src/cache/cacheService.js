const MultiLevelCacheManager = require('./multiLevelCache');
const CacheInvalidationManager = require('./cacheInvalidation');
const EventEmitter = require('events');

/**
 * Unified Cache Service
 * 
 * Provides a high-level interface for caching with:
 * - Multi-level caching (L1, L2, L3)
 * - Intelligent invalidation
 * - Performance monitoring
 * - Room-specific caching
 * - User-specific caching
 * - Message caching
 */
class CacheService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      // Cache configuration
      enableMultiLevel: options.enableMultiLevel !== false,
      enableInvalidation: options.enableInvalidation !== false,
      
      // Room caching
      roomCacheTTL: options.roomCacheTTL || 1800, // 30 minutes
      userListCacheTTL: options.userListCacheTTL || 300, // 5 minutes
      
      // Message caching
      messageCacheTTL: options.messageCacheTTL || 3600, // 1 hour
      messageHistoryLimit: options.messageHistoryLimit || 100,
      
      // User caching
      userProfileCacheTTL: options.userProfileCacheTTL || 7200, // 2 hours
      userSessionCacheTTL: options.userSessionCacheTTL || 3600, // 1 hour
      
      // Performance settings
      enableMetrics: options.enableMetrics !== false,
      enableWarming: options.enableWarming !== false,
      
      ...options
    };
    
    // Initialize cache managers
    this.cache = new MultiLevelCacheManager(this.options);
    this.invalidation = new CacheInvalidationManager(this.cache, this.options);
    
    // Performance metrics
    this.metrics = {
      requests: 0,
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
    
    this.setupEventHandlers();
    this.setupDefaultCachingStrategies();
    
    console.log('🗄️  CACHE-SERVICE: Unified cache service initialized');
  }

  setupEventHandlers() {
    // Forward cache events
    this.cache.on('cache-hit', (data) => this.emit('cache-hit', data));
    this.cache.on('cache-miss', (data) => this.emit('cache-miss', data));
    this.cache.on('cache-error', (data) => this.emit('cache-error', data));
    
    // Forward invalidation events
    this.invalidation.on('key-invalidated', (data) => this.emit('key-invalidated', data));
    this.invalidation.on('tag-invalidated', (data) => this.emit('tag-invalidated', data));
    
    // Track metrics
    this.cache.on('cache-hit', () => { this.metrics.hits++; this.metrics.requests++; });
    this.cache.on('cache-miss', () => { this.metrics.misses++; this.metrics.requests++; });
    this.cache.on('cache-set', () => this.metrics.sets++);
    this.cache.on('cache-delete', () => this.metrics.deletes++);
    this.cache.on('cache-error', () => this.metrics.errors++);
  }

  setupDefaultCachingStrategies() {
    // Setup cache warming strategies
    this.invalidation.registerWarmingStrategy(
      'room:.*:users',
      async (key) => this.warmRoomUsers(key),
      { l1TTL: 300, l2TTL: 1800 }
    );
    
    this.invalidation.registerWarmingStrategy(
      'room:.*:messages',
      async (key) => this.warmRoomMessages(key),
      { l1TTL: 600, l2TTL: 3600 }
    );
    
    this.invalidation.registerWarmingStrategy(
      'user:.*:profile',
      async (key) => this.warmUserProfile(key),
      { l1TTL: 1800, l2TTL: 7200 }
    );
  }

  /**
   * Room Caching Methods
   */
  async getRoomData(roomId, fallbackFn = null) {
    const key = `room:${roomId}:data`;
    this.invalidation.recordAccess(key, null, roomId);
    
    return await this.cache.get(key, fallbackFn, {
      l1TTL: this.options.roomCacheTTL / 6,
      l2TTL: this.options.roomCacheTTL,
      useL3: false
    });
  }

  async setRoomData(roomId, data, options = {}) {
    const key = `room:${roomId}:data`;
    
    // Tag for easy invalidation
    this.invalidation.tagKey(key, ['room', `room:${roomId}`]);
    
    await this.cache.set(key, data, {
      l1TTL: this.options.roomCacheTTL / 6,
      l2TTL: this.options.roomCacheTTL,
      useL3: false,
      ...options
    });
  }

  async getRoomUsers(roomId, fallbackFn = null) {
    const key = `room:${roomId}:users`;
    this.invalidation.recordAccess(key, null, roomId);
    
    return await this.cache.get(key, fallbackFn, {
      l1TTL: this.options.userListCacheTTL / 3,
      l2TTL: this.options.userListCacheTTL,
      useL3: false
    });
  }

  async setRoomUsers(roomId, users, options = {}) {
    const key = `room:${roomId}:users`;
    
    this.invalidation.tagKey(key, ['room', `room:${roomId}`, 'users']);
    this.invalidation.addDependency(key, [`room:${roomId}:data`]);
    
    await this.cache.set(key, users, {
      l1TTL: this.options.userListCacheTTL / 3,
      l2TTL: this.options.userListCacheTTL,
      useL3: false,
      ...options
    });
  }

  async getRoomUserCount(roomId, fallbackFn = null) {
    const key = `room:${roomId}:count`;
    this.invalidation.recordAccess(key, null, roomId);
    
    return await this.cache.get(key, fallbackFn, {
      l1TTL: 60, // 1 minute for fast-changing data
      l2TTL: 300, // 5 minutes
      useL3: false
    });
  }

  async setRoomUserCount(roomId, count, options = {}) {
    const key = `room:${roomId}:count`;
    
    this.invalidation.tagKey(key, ['room', `room:${roomId}`, 'count']);
    this.invalidation.addDependency(key, [`room:${roomId}:users`]);
    
    await this.cache.set(key, count, {
      l1TTL: 60,
      l2TTL: 300,
      useL3: false,
      ...options
    });
  }

  /**
   * Message Caching Methods
   */
  async getRoomMessages(roomId, limit = 50, fallbackFn = null) {
    const key = `room:${roomId}:messages:${limit}`;
    this.invalidation.recordAccess(key, null, roomId);
    
    return await this.cache.get(key, fallbackFn, {
      l1TTL: this.options.messageCacheTTL / 6,
      l2TTL: this.options.messageCacheTTL,
      useL3: true
    });
  }

  async setRoomMessages(roomId, messages, limit = 50, options = {}) {
    const key = `room:${roomId}:messages:${limit}`;
    
    this.invalidation.tagKey(key, ['messages', `room:${roomId}`, 'room-messages']);
    this.invalidation.addDependency(key, [`room:${roomId}:data`]);
    
    await this.cache.set(key, messages, {
      l1TTL: this.options.messageCacheTTL / 6,
      l2TTL: this.options.messageCacheTTL,
      l3TTL: this.options.messageCacheTTL * 4, // Longer persistence
      ...options
    });
  }

  async addMessageToCache(roomId, message) {
    const limits = [10, 25, 50, 100];
    
    for (const limit of limits) {
      const key = `room:${roomId}:messages:${limit}`;
      
      try {
        const messages = await this.cache.get(key) || [];
        
        // Add new message and maintain limit
        messages.unshift(message);
        if (messages.length > limit) {
          messages.splice(limit);
        }
        
        await this.setRoomMessages(roomId, messages, limit);
        
      } catch (error) {
        console.error(`❌ CACHE-SERVICE: Error adding message to cache for limit ${limit}:`, error);
      }
    }
    
    // Invalidate related caches
    this.invalidation.handleEvent('message-sent', { roomId, message });
  }

  /**
   * User Caching Methods
   */
  async getUserProfile(userId, fallbackFn = null) {
    const key = `user:${userId}:profile`;
    this.invalidation.recordAccess(key, userId);
    
    return await this.cache.get(key, fallbackFn, {
      l1TTL: this.options.userProfileCacheTTL / 4,
      l2TTL: this.options.userProfileCacheTTL,
      useL3: true
    });
  }

  async setUserProfile(userId, profile, options = {}) {
    const key = `user:${userId}:profile`;
    
    this.invalidation.tagKey(key, ['user', `user:${userId}`, 'profiles']);
    
    await this.cache.set(key, profile, {
      l1TTL: this.options.userProfileCacheTTL / 4,
      l2TTL: this.options.userProfileCacheTTL,
      l3TTL: this.options.userProfileCacheTTL * 2,
      ...options
    });
  }

  async getUserSession(userId, sessionId, fallbackFn = null) {
    const key = `user:${userId}:session:${sessionId}`;
    this.invalidation.recordAccess(key, userId);
    
    return await this.cache.get(key, fallbackFn, {
      l1TTL: this.options.userSessionCacheTTL / 3,
      l2TTL: this.options.userSessionCacheTTL,
      useL3: false
    });
  }

  async setUserSession(userId, sessionId, sessionData, options = {}) {
    const key = `user:${userId}:session:${sessionId}`;
    
    this.invalidation.tagKey(key, ['user', `user:${userId}`, 'sessions']);
    this.invalidation.addDependency(key, [`user:${userId}:profile`]);
    
    await this.cache.set(key, sessionData, {
      l1TTL: this.options.userSessionCacheTTL / 3,
      l2TTL: this.options.userSessionCacheTTL,
      useL3: false,
      ...options
    });
  }

  async getUserRooms(userId, fallbackFn = null) {
    const key = `user:${userId}:rooms`;
    this.invalidation.recordAccess(key, userId);
    
    return await this.cache.get(key, fallbackFn, {
      l1TTL: 300, // 5 minutes
      l2TTL: 1800, // 30 minutes
      useL3: false
    });
  }

  async setUserRooms(userId, rooms, options = {}) {
    const key = `user:${userId}:rooms`;
    
    this.invalidation.tagKey(key, ['user', `user:${userId}`, 'user-rooms']);
    this.invalidation.addDependency(key, [`user:${userId}:profile`]);
    
    await this.cache.set(key, rooms, {
      l1TTL: 300,
      l2TTL: 1800,
      useL3: false,
      ...options
    });
  }

  /**
   * Event Handlers for Cache Invalidation
   */
  onUserJoinedRoom(userId, roomId, userData = {}) {
    this.invalidation.handleEvent('user-joined', { userId, roomId, userData });
    
    // Invalidate related caches
    this.invalidateRoomCaches(roomId);
    this.invalidateUserRoomsCaches(userId);
  }

  onUserLeftRoom(userId, roomId, userData = {}) {
    this.invalidation.handleEvent('user-left', { userId, roomId, userData });
    
    // Invalidate related caches
    this.invalidateRoomCaches(roomId);
    this.invalidateUserRoomsCaches(userId);
  }

  onRoomUpdated(roomId, updateData = {}) {
    this.invalidation.handleEvent('room-updated', { roomId, updateData });
  }

  onUserProfileUpdated(userId, profileData = {}) {
    this.invalidation.invalidateByTag(`user:${userId}`, { reason: 'profile-updated' });
  }

  /**
   * Bulk Invalidation Methods
   */
  async invalidateRoomCaches(roomId) {
    await this.invalidation.invalidateByTag(`room:${roomId}`, { reason: 'room-updated' });
  }

  async invalidateUserCaches(userId) {
    await this.invalidation.invalidateByTag(`user:${userId}`, { reason: 'user-updated' });
  }

  async invalidateUserRoomsCaches(userId) {
    await this.invalidation.invalidateByPattern(`user:${userId}:rooms*`, { reason: 'user-rooms-updated' });
  }

  async invalidateMessageCaches(roomId) {
    await this.invalidation.invalidateByPattern(`room:${roomId}:messages*`, { reason: 'messages-updated' });
  }

  /**
   * Cache Warming Methods
   */
  async warmRoomUsers(key) {
    const roomId = key.split(':')[1];
    // This would typically call your room service
    // For now, return null as placeholder
    console.log(`🔥 CACHE-SERVICE: Warming room users for ${roomId}`);
    return null;
  }

  async warmRoomMessages(key) {
    const roomId = key.split(':')[1];
    const limit = parseInt(key.split(':')[3]) || 50;
    // This would typically call your message service
    console.log(`🔥 CACHE-SERVICE: Warming room messages for ${roomId} (limit: ${limit})`);
    return null;
  }

  async warmUserProfile(key) {
    const userId = key.split(':')[1];
    // This would typically call your user service
    console.log(`🔥 CACHE-SERVICE: Warming user profile for ${userId}`);
    return null;
  }

  async warmCriticalData() {
    console.log('🔥 CACHE-SERVICE: Starting critical data warming...');
    
    // This would warm frequently accessed data
    // Implementation depends on your specific use case
    
    console.log('✅ CACHE-SERVICE: Critical data warming completed');
  }

  /**
   * Performance and Statistics Methods
   */
  getPerformanceStats() {
    return {
      service: this.metrics,
      cache: this.cache.getStats(),
      invalidation: this.invalidation.getStats()
    };
  }

  getCacheHitRate() {
    const total = this.metrics.hits + this.metrics.misses;
    return total > 0 ? (this.metrics.hits / total * 100).toFixed(2) : 0;
  }

  async getMemoryUsage() {
    return {
      l1Memory: this.cache.l1MemoryUsage,
      l1Size: this.cache.l1Cache.size,
      processMemory: process.memoryUsage()
    };
  }

  /**
   * Administrative Methods
   */
  async clearAllCaches() {
    await this.cache.clear('all');
    console.log('🗑️  CACHE-SERVICE: All caches cleared');
  }

  async clearRoomCaches(roomId) {
    await this.invalidation.invalidateByPattern(`room:${roomId}:*`);
    console.log(`🗑️  CACHE-SERVICE: Room ${roomId} caches cleared`);
  }

  async clearUserCaches(userId) {
    await this.invalidation.invalidateByPattern(`user:${userId}:*`);
    console.log(`🗑️  CACHE-SERVICE: User ${userId} caches cleared`);
  }

  /**
   * Health Check
   */
  async healthCheck() {
    try {
      const testKey = 'health:check:' + Date.now();
      const testValue = { timestamp: Date.now(), test: true };
      
      // Test set operation
      await this.cache.set(testKey, testValue, { skipL3: true });
      
      // Test get operation
      const retrieved = await this.cache.get(testKey);
      
      // Test delete operation
      await this.cache.delete(testKey);
      
      const isHealthy = retrieved && 
                       retrieved.timestamp === testValue.timestamp && 
                       retrieved.test === testValue.test;
      
      return {
        healthy: isHealthy,
        timestamp: Date.now(),
        stats: this.getPerformanceStats()
      };
      
    } catch (error) {
      console.error('❌ CACHE-SERVICE: Health check failed:', error);
      return {
        healthy: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
}

module.exports = CacheService;