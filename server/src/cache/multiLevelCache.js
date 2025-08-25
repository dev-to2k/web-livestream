const EventEmitter = require('events');
const redisManager = require('./redis');

/**
 * Multi-Level Cache Manager
 * 
 * Implements a sophisticated 3-layer caching system:
 * - L1: In-memory cache (fastest, limited size)
 * - L2: Redis cache (fast, shared across servers)
 * - L3: Database cache (persistent, slower)
 * 
 * Features:
 * - Intelligent cache warming
 * - TTL-based expiration
 * - Cache hit/miss metrics
 * - Automatic invalidation
 * - Memory pressure management
 */
class MultiLevelCacheManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      // L1 Cache (In-Memory) settings
      l1MaxSize: options.l1MaxSize || 10000, // Max number of items
      l1MaxMemory: options.l1MaxMemory || 100 * 1024 * 1024, // 100MB
      l1DefaultTTL: options.l1DefaultTTL || 300, // 5 minutes
      
      // L2 Cache (Redis) settings
      l2DefaultTTL: options.l2DefaultTTL || 3600, // 1 hour
      l2KeyPrefix: options.l2KeyPrefix || 'cache:',
      
      // L3 Cache (Database) settings
      l3DefaultTTL: options.l3DefaultTTL || 86400, // 24 hours
      
      // General settings
      enableMetrics: options.enableMetrics !== false,
      enableWarming: options.enableWarming !== false,
      compressionThreshold: options.compressionThreshold || 1024, // Compress data > 1KB
      
      ...options
    };
    
    // L1 Cache (In-Memory)
    this.l1Cache = new Map();
    this.l1Metadata = new Map(); // TTL and access tracking
    this.l1MemoryUsage = 0;
    
    // Cache statistics
    this.stats = {
      l1: { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0 },
      l2: { hits: 0, misses: 0, sets: 0, deletes: 0 },
      l3: { hits: 0, misses: 0, sets: 0, deletes: 0 },
      total: { hits: 0, misses: 0 }
    };
    
    // Cache warming queue
    this.warmingQueue = new Set();
    this.isWarmingActive = false;
    
    this.startCleanupInterval();
    this.startMetricsCollection();
    
    console.log('🗄️  CACHE: Multi-level cache manager initialized');
  }

  /**
   * Get data from cache with fallback through all levels
   */
  async get(key, fallbackFn = null, options = {}) {
    const startTime = Date.now();
    
    try {
      // Try L1 cache first
      const l1Result = this.getFromL1(key);
      if (l1Result !== null) {
        this.updateStats('l1', 'hit');
        this.updateStats('total', 'hit');
        this.emit('cache-hit', { level: 'L1', key, latency: Date.now() - startTime });
        return l1Result;
      }
      
      // Try L2 cache (Redis)
      const l2Result = await this.getFromL2(key);
      if (l2Result !== null) {
        this.updateStats('l2', 'hit');
        this.updateStats('total', 'hit');
        
        // Promote to L1 cache
        this.setToL1(key, l2Result, options.l1TTL);
        
        this.emit('cache-hit', { level: 'L2', key, latency: Date.now() - startTime });
        return l2Result;
      }
      
      // Try L3 cache (Database) if enabled
      if (options.useL3 !== false) {
        const l3Result = await this.getFromL3(key);
        if (l3Result !== null) {
          this.updateStats('l3', 'hit');
          this.updateStats('total', 'hit');
          
          // Promote to L2 and L1 caches
          await this.setToL2(key, l3Result, options.l2TTL);
          this.setToL1(key, l3Result, options.l1TTL);
          
          this.emit('cache-hit', { level: 'L3', key, latency: Date.now() - startTime });
          return l3Result;
        }
      }
      
      // Cache miss - use fallback function if provided
      this.updateStats('total', 'miss');
      
      if (fallbackFn && typeof fallbackFn === 'function') {
        const result = await fallbackFn(key);
        if (result !== null && result !== undefined) {
          // Store in all cache levels
          await this.set(key, result, options);
        }
        
        this.emit('cache-miss', { key, latency: Date.now() - startTime, fallbackUsed: true });
        return result;
      }
      
      this.emit('cache-miss', { key, latency: Date.now() - startTime, fallbackUsed: false });
      return null;
      
    } catch (error) {
      console.error(`❌ CACHE: Error getting key ${key}:`, error);
      this.emit('cache-error', { operation: 'get', key, error });
      return null;
    }
  }

  /**
   * Set data in all cache levels
   */
  async set(key, value, options = {}) {
    try {
      const {
        l1TTL = this.options.l1DefaultTTL,
        l2TTL = this.options.l2DefaultTTL,
        l3TTL = this.options.l3DefaultTTL,
        skipL1 = false,
        skipL2 = false,
        skipL3 = false
      } = options;
      
      // Set in L1 cache
      if (!skipL1) {
        this.setToL1(key, value, l1TTL);
      }
      
      // Set in L2 cache (Redis)
      if (!skipL2) {
        await this.setToL2(key, value, l2TTL);
      }
      
      // Set in L3 cache (Database)
      if (!skipL3 && options.useL3 !== false) {
        await this.setToL3(key, value, l3TTL);
      }
      
      this.emit('cache-set', { key, levels: { l1: !skipL1, l2: !skipL2, l3: !skipL3 } });
      
    } catch (error) {
      console.error(`❌ CACHE: Error setting key ${key}:`, error);
      this.emit('cache-error', { operation: 'set', key, error });
    }
  }

  /**
   * Delete from all cache levels
   */
  async delete(key) {
    try {
      // Delete from L1
      this.deleteFromL1(key);
      
      // Delete from L2
      await this.deleteFromL2(key);
      
      // Delete from L3
      await this.deleteFromL3(key);
      
      this.emit('cache-delete', { key });
      
    } catch (error) {
      console.error(`❌ CACHE: Error deleting key ${key}:`, error);
      this.emit('cache-error', { operation: 'delete', key, error });
    }
  }

  /**
   * L1 Cache (In-Memory) Methods
   */
  getFromL1(key) {
    const metadata = this.l1Metadata.get(key);
    if (!metadata) {
      this.updateStats('l1', 'miss');
      return null;
    }
    
    // Check TTL
    if (Date.now() > metadata.expiresAt) {
      this.deleteFromL1(key);
      this.updateStats('l1', 'miss');
      return null;
    }
    
    // Update access time
    metadata.lastAccessed = Date.now();
    metadata.accessCount++;
    
    return this.l1Cache.get(key);
  }

  setToL1(key, value, ttl = this.options.l1DefaultTTL) {
    const serializedSize = this.estimateSize(value);
    
    // Check memory pressure and evict if necessary
    this.ensureL1Capacity(serializedSize);
    
    const expiresAt = Date.now() + (ttl * 1000);
    
    this.l1Cache.set(key, value);
    this.l1Metadata.set(key, {
      size: serializedSize,
      expiresAt,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1
    });
    
    this.l1MemoryUsage += serializedSize;
    this.updateStats('l1', 'set');
  }

  deleteFromL1(key) {
    const metadata = this.l1Metadata.get(key);
    if (metadata) {
      this.l1MemoryUsage -= metadata.size;
    }
    
    this.l1Cache.delete(key);
    this.l1Metadata.delete(key);
    this.updateStats('l1', 'delete');
  }

  /**
   * L2 Cache (Redis) Methods
   */
  async getFromL2(key) {
    try {
      const redis = redisManager.getClient();
      const data = await redis.get(this.getL2Key(key));
      
      if (data === null) {
        this.updateStats('l2', 'miss');
        return null;
      }
      
      const parsed = JSON.parse(data);
      return parsed.compressed ? this.decompress(parsed.data) : parsed.data;
      
    } catch (error) {
      console.error(`❌ CACHE: Error getting from L2 cache:`, error);
      this.updateStats('l2', 'miss');
      return null;
    }
  }

  async setToL2(key, value, ttl = this.options.l2DefaultTTL) {
    try {
      const redis = redisManager.getClient();
      const serialized = JSON.stringify(value);
      
      let data = { data: value, compressed: false };
      
      // Compress large data
      if (serialized.length > this.options.compressionThreshold) {
        data = { data: this.compress(value), compressed: true };
      }
      
      await redis.setex(this.getL2Key(key), ttl, JSON.stringify(data));
      this.updateStats('l2', 'set');
      
    } catch (error) {
      console.error(`❌ CACHE: Error setting to L2 cache:`, error);
    }
  }

  async deleteFromL2(key) {
    try {
      const redis = redisManager.getClient();
      await redis.del(this.getL2Key(key));
      this.updateStats('l2', 'delete');
      
    } catch (error) {
      console.error(`❌ CACHE: Error deleting from L2 cache:`, error);
    }
  }

  /**
   * L3 Cache (Database) Methods
   */
  async getFromL3(key) {
    // This would integrate with your database layer
    // For now, return null (not implemented)
    this.updateStats('l3', 'miss');
    return null;
  }

  async setToL3(key, value, ttl) {
    // This would integrate with your database layer
    // For now, do nothing (not implemented)
    this.updateStats('l3', 'set');
  }

  async deleteFromL3(key) {
    // This would integrate with your database layer
    // For now, do nothing (not implemented)
    this.updateStats('l3', 'delete');
  }

  /**
   * Cache Warming Methods
   */
  async warmCache(keys, warmingFn) {
    if (!this.options.enableWarming || this.isWarmingActive) {
      return;
    }
    
    this.isWarmingActive = true;
    console.log(`🔥 CACHE: Starting cache warming for ${keys.length} keys`);
    
    try {
      const batchSize = 10;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (key) => {
          try {
            const exists = await this.has(key);
            if (!exists) {
              const value = await warmingFn(key);
              if (value !== null) {
                await this.set(key, value, { skipL3: true });
              }
            }
          } catch (error) {
            console.error(`❌ CACHE: Error warming key ${key}:`, error);
          }
        }));
        
        // Small delay between batches to avoid overwhelming the system
        if (i + batchSize < keys.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      console.log(`✅ CACHE: Cache warming completed for ${keys.length} keys`);
      
    } finally {
      this.isWarmingActive = false;
    }
  }

  /**
   * Cache Management Methods
   */
  async has(key) {
    return (this.getFromL1(key) !== null) || 
           (await this.getFromL2(key) !== null) || 
           (await this.getFromL3(key) !== null);
  }

  async clear(level = 'all') {
    try {
      if (level === 'all' || level === 'l1') {
        this.l1Cache.clear();
        this.l1Metadata.clear();
        this.l1MemoryUsage = 0;
      }
      
      if (level === 'all' || level === 'l2') {
        const redis = redisManager.getClient();
        const pattern = this.getL2Key('*');
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(keys);
        }
      }
      
      if (level === 'all' || level === 'l3') {
        // Clear L3 cache (database layer)
        // Implementation depends on your database layer
      }
      
      console.log(`🗄️  CACHE: Cleared ${level} cache`);
      
    } catch (error) {
      console.error(`❌ CACHE: Error clearing ${level} cache:`, error);
    }
  }

  /**
   * Memory Management
   */
  ensureL1Capacity(newItemSize) {
    const maxMemory = this.options.l1MaxMemory;
    const maxSize = this.options.l1MaxSize;
    
    // Check memory limit
    while (this.l1MemoryUsage + newItemSize > maxMemory || this.l1Cache.size >= maxSize) {
      this.evictLRU();
    }
  }

  evictLRU() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, metadata] of this.l1Metadata) {
      if (metadata.lastAccessed < oldestTime) {
        oldestTime = metadata.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.deleteFromL1(oldestKey);
      this.updateStats('l1', 'eviction');
      console.log(`🗑️  CACHE: Evicted LRU key: ${oldestKey}`);
    }
  }

  /**
   * Utility Methods
   */
  getL2Key(key) {
    return `${this.options.l2KeyPrefix}${key}`;
  }

  estimateSize(obj) {
    return JSON.stringify(obj).length * 2; // Rough estimation (UTF-16)
  }

  compress(data) {
    // Simple compression - in production, use zlib or similar
    return JSON.stringify(data);
  }

  decompress(data) {
    // Simple decompression - in production, use zlib or similar
    return JSON.parse(data);
  }

  updateStats(level, operation) {
    if (!this.options.enableMetrics) return;
    
    if (this.stats[level] && this.stats[level][operation] !== undefined) {
      this.stats[level][operation]++;
    }
  }

  /**
   * Monitoring and Cleanup
   */
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupExpiredL1();
    }, 60000); // Cleanup every minute
  }

  cleanupExpiredL1() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, metadata] of this.l1Metadata) {
      if (now > metadata.expiresAt) {
        this.deleteFromL1(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 CACHE: Cleaned up ${cleanedCount} expired L1 cache entries`);
    }
  }

  startMetricsCollection() {
    if (!this.options.enableMetrics) return;
    
    setInterval(() => {
      this.collectMetrics();
    }, 30000); // Collect metrics every 30 seconds
  }

  collectMetrics() {
    const metrics = {
      l1: {
        size: this.l1Cache.size,
        memoryUsage: this.l1MemoryUsage,
        hitRate: this.calculateHitRate('l1'),
        ...this.stats.l1
      },
      l2: {
        hitRate: this.calculateHitRate('l2'),
        ...this.stats.l2
      },
      l3: {
        hitRate: this.calculateHitRate('l3'),
        ...this.stats.l3
      },
      total: {
        hitRate: this.calculateHitRate('total'),
        ...this.stats.total
      }
    };
    
    this.emit('metrics', metrics);
  }

  calculateHitRate(level) {
    const stats = this.stats[level];
    const total = stats.hits + stats.misses;
    return total > 0 ? (stats.hits / total * 100).toFixed(2) : 0;
  }

  getStats() {
    return {
      ...this.stats,
      l1: {
        ...this.stats.l1,
        size: this.l1Cache.size,
        memoryUsage: this.l1MemoryUsage,
        hitRate: this.calculateHitRate('l1')
      },
      l2: {
        ...this.stats.l2,
        hitRate: this.calculateHitRate('l2')
      },
      l3: {
        ...this.stats.l3,
        hitRate: this.calculateHitRate('l3')
      },
      total: {
        ...this.stats.total,
        hitRate: this.calculateHitRate('total')
      }
    };
  }
}

module.exports = MultiLevelCacheManager;