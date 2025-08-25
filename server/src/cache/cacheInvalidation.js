const EventEmitter = require('events');
const redisManager = require('./redis');

/**
 * Cache Invalidation & Warming Manager
 * 
 * Implements intelligent cache invalidation strategies:
 * - Tag-based invalidation
 * - Dependency tracking
 * - Time-based invalidation
 * - Event-driven invalidation
 * - Predictive cache warming
 * - Pattern-based invalidation
 */
class CacheInvalidationManager extends EventEmitter {
  constructor(cacheManager, options = {}) {
    super();
    
    this.cacheManager = cacheManager;
    this.options = {
      enableTagging: options.enableTagging !== false,
      enableDependencyTracking: options.enableDependencyTracking !== false,
      enablePredictiveWarming: options.enablePredictiveWarming !== false,
      warmingBatchSize: options.warmingBatchSize || 50,
      maxDependencyDepth: options.maxDependencyDepth || 3,
      invalidationDelay: options.invalidationDelay || 0, // ms
      ...options
    };
    
    // Tag-based invalidation system
    this.tagToKeys = new Map(); // tag -> Set of keys
    this.keyToTags = new Map(); // key -> Set of tags
    
    // Dependency tracking
    this.dependencies = new Map(); // key -> Set of dependent keys
    this.dependents = new Map(); // key -> Set of keys that depend on this
    
    // Warming patterns and predictions
    this.accessPatterns = new Map(); // key -> access pattern data
    this.warmingQueue = new Set();
    this.warmingStrategies = new Map();
    
    // Event-driven invalidation
    this.eventInvalidations = new Map(); // event -> invalidation rules
    
    this.initializeDefaultStrategies();
    this.startPatternAnalysis();
    
    console.log('🔄 INVALIDATION: Cache invalidation manager initialized');
  }

  /**
   * Tag-based Invalidation
   */
  tagKey(key, tags) {
    if (!this.options.enableTagging) return;
    
    const tagSet = Array.isArray(tags) ? new Set(tags) : new Set([tags]);
    
    // Store tags for the key
    this.keyToTags.set(key, tagSet);
    
    // Map tags to keys
    for (const tag of tagSet) {
      if (!this.tagToKeys.has(tag)) {
        this.tagToKeys.set(tag, new Set());
      }
      this.tagToKeys.get(tag).add(key);
    }
    
    console.log(`🏷️  INVALIDATION: Tagged key ${key} with tags: ${Array.from(tagSet).join(', ')}`);
  }

  async invalidateByTag(tag, options = {}) {
    if (!this.options.enableTagging) return;
    
    const keys = this.tagToKeys.get(tag);
    if (!keys || keys.size === 0) {
      console.log(`🏷️  INVALIDATION: No keys found for tag: ${tag}`);
      return;
    }
    
    console.log(`🏷️  INVALIDATION: Invalidating ${keys.size} keys for tag: ${tag}`);
    
    const invalidationPromises = Array.from(keys).map(key => 
      this.invalidateKey(key, { ...options, reason: `tag:${tag}` })
    );
    
    await Promise.all(invalidationPromises);
    
    // Update tag mappings
    for (const key of keys) {
      this.removeKeyFromTags(key);
    }
    this.tagToKeys.delete(tag);
    
    this.emit('tag-invalidated', { tag, keyCount: keys.size });
  }

  async invalidateByTags(tags, options = {}) {
    const invalidationPromises = tags.map(tag => this.invalidateByTag(tag, options));
    await Promise.all(invalidationPromises);
  }

  removeKeyFromTags(key) {
    const tags = this.keyToTags.get(key);
    if (tags) {
      for (const tag of tags) {
        const tagKeys = this.tagToKeys.get(tag);
        if (tagKeys) {
          tagKeys.delete(key);
          if (tagKeys.size === 0) {
            this.tagToKeys.delete(tag);
          }
        }
      }
      this.keyToTags.delete(key);
    }
  }

  /**
   * Dependency-based Invalidation
   */
  addDependency(key, dependsOn) {
    if (!this.options.enableDependencyTracking) return;
    
    const dependencySet = Array.isArray(dependsOn) ? new Set(dependsOn) : new Set([dependsOn]);
    
    // Store dependencies
    this.dependencies.set(key, dependencySet);
    
    // Store reverse dependencies
    for (const dep of dependencySet) {
      if (!this.dependents.has(dep)) {
        this.dependents.set(dep, new Set());
      }
      this.dependents.get(dep).add(key);
    }
    
    console.log(`🔗 INVALIDATION: Added dependencies for ${key}: ${Array.from(dependencySet).join(', ')}`);
  }

  async invalidateWithDependencies(key, options = {}) {
    const visited = new Set();
    const toInvalidate = new Set();
    
    // Build dependency tree
    this.buildInvalidationTree(key, toInvalidate, visited, 0);
    
    console.log(`🔗 INVALIDATION: Invalidating ${toInvalidate.size} keys (including dependencies) for: ${key}`);
    
    // Sort by dependency depth to invalidate in correct order
    const sortedKeys = Array.from(toInvalidate).sort((a, b) => {
      const depthA = this.getDependencyDepth(a);
      const depthB = this.getDependencyDepth(b);
      return depthB - depthA; // Invalidate deeper dependencies first
    });
    
    for (const keyToInvalidate of sortedKeys) {
      await this.invalidateKey(keyToInvalidate, { 
        ...options, 
        reason: `dependency:${key}` 
      });
    }
    
    this.emit('dependency-invalidated', { rootKey: key, invalidatedCount: toInvalidate.size });
  }

  buildInvalidationTree(key, toInvalidate, visited, depth) {
    if (visited.has(key) || depth > this.options.maxDependencyDepth) {
      return;
    }
    
    visited.add(key);
    toInvalidate.add(key);
    
    // Add all dependents
    const dependents = this.dependents.get(key);
    if (dependents) {
      for (const dependent of dependents) {
        this.buildInvalidationTree(dependent, toInvalidate, visited, depth + 1);
      }
    }
  }

  getDependencyDepth(key, visited = new Set()) {
    if (visited.has(key)) return 0;
    visited.add(key);
    
    const dependents = this.dependents.get(key);
    if (!dependents || dependents.size === 0) return 0;
    
    let maxDepth = 0;
    for (const dependent of dependents) {
      const depth = this.getDependencyDepth(dependent, visited);
      maxDepth = Math.max(maxDepth, depth);
    }
    
    return maxDepth + 1;
  }

  /**
   * Pattern-based Invalidation
   */
  async invalidateByPattern(pattern, options = {}) {
    try {
      const redis = redisManager.getClient();
      const keys = await redis.keys(pattern);
      
      if (keys.length === 0) {
        console.log(`🔍 INVALIDATION: No keys found for pattern: ${pattern}`);
        return;
      }
      
      console.log(`🔍 INVALIDATION: Invalidating ${keys.length} keys for pattern: ${pattern}`);
      
      const batchSize = options.batchSize || 100;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        const invalidationPromises = batch.map(key => 
          this.invalidateKey(key, { ...options, reason: `pattern:${pattern}` })
        );
        await Promise.all(invalidationPromises);
        
        // Small delay between batches
        if (i + batchSize < keys.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      this.emit('pattern-invalidated', { pattern, keyCount: keys.length });
      
    } catch (error) {
      console.error(`❌ INVALIDATION: Error invalidating pattern ${pattern}:`, error);
    }
  }

  /**
   * Event-driven Invalidation
   */
  onEvent(eventName, invalidationRule) {
    if (!this.eventInvalidations.has(eventName)) {
      this.eventInvalidations.set(eventName, []);
    }
    
    this.eventInvalidations.get(eventName).push(invalidationRule);
    console.log(`📡 INVALIDATION: Registered invalidation rule for event: ${eventName}`);
  }

  async handleEvent(eventName, eventData = {}) {
    const rules = this.eventInvalidations.get(eventName);
    if (!rules || rules.length === 0) return;
    
    console.log(`📡 INVALIDATION: Processing ${rules.length} invalidation rules for event: ${eventName}`);
    
    for (const rule of rules) {
      try {
        await this.processInvalidationRule(rule, eventData);
      } catch (error) {
        console.error(`❌ INVALIDATION: Error processing rule for event ${eventName}:`, error);
      }
    }
  }

  async processInvalidationRule(rule, eventData) {
    switch (rule.type) {
      case 'key':
        await this.invalidateKey(rule.target, { reason: `event:${rule.event}` });
        break;
        
      case 'tag':
        await this.invalidateByTag(rule.target, { reason: `event:${rule.event}` });
        break;
        
      case 'pattern':
        await this.invalidateByPattern(rule.target, { reason: `event:${rule.event}` });
        break;
        
      case 'function':
        if (typeof rule.target === 'function') {
          const keysToInvalidate = await rule.target(eventData);
          if (Array.isArray(keysToInvalidate)) {
            for (const key of keysToInvalidate) {
              await this.invalidateKey(key, { reason: `event:${rule.event}` });
            }
          }
        }
        break;
        
      default:
        console.warn(`⚠️  INVALIDATION: Unknown rule type: ${rule.type}`);
    }
  }

  /**
   * Predictive Cache Warming
   */
  recordAccess(key, userId = null, roomId = null) {
    if (!this.options.enablePredictiveWarming) return;
    
    const now = Date.now();
    const hour = new Date(now).getHours();
    
    if (!this.accessPatterns.has(key)) {
      this.accessPatterns.set(key, {
        totalAccesses: 0,
        lastAccess: now,
        hourlyAccesses: new Array(24).fill(0),
        userAccesses: new Map(),
        roomAccesses: new Map(),
        accessFrequency: 0,
        predictedNextAccess: now + 3600000 // 1 hour default
      });
    }
    
    const pattern = this.accessPatterns.get(key);
    pattern.totalAccesses++;
    pattern.lastAccess = now;
    pattern.hourlyAccesses[hour]++;
    
    if (userId) {
      pattern.userAccesses.set(userId, (pattern.userAccesses.get(userId) || 0) + 1);
    }
    
    if (roomId) {
      pattern.roomAccesses.set(roomId, (pattern.roomAccesses.get(roomId) || 0) + 1);
    }
    
    // Update access frequency (accesses per hour)
    const timeSinceFirst = now - (pattern.firstAccess || now);
    pattern.accessFrequency = pattern.totalAccesses / Math.max(1, timeSinceFirst / 3600000);
    
    // Predict next access
    this.updateAccessPrediction(key, pattern);
  }

  updateAccessPrediction(key, pattern) {
    const now = Date.now();
    const currentHour = new Date(now).getHours();
    
    // Find the most active hours
    const avgAccesses = pattern.hourlyAccesses.reduce((a, b) => a + b, 0) / 24;
    const nextActiveHours = [];
    
    for (let i = 1; i <= 24; i++) {
      const hour = (currentHour + i) % 24;
      if (pattern.hourlyAccesses[hour] > avgAccesses) {
        nextActiveHours.push(hour);
        break;
      }
    }
    
    if (nextActiveHours.length > 0) {
      const nextHour = nextActiveHours[0];
      const hoursUntilNext = nextHour > currentHour ? 
        nextHour - currentHour : 
        24 - currentHour + nextHour;
      
      pattern.predictedNextAccess = now + (hoursUntilNext * 3600000);
    }
  }

  async performPredictiveWarming() {
    if (!this.options.enablePredictiveWarming) return;
    
    const now = Date.now();
    const keysToWarm = [];
    
    // Find keys that are predicted to be accessed soon
    for (const [key, pattern] of this.accessPatterns) {
      const timeToPredictedAccess = pattern.predictedNextAccess - now;
      
      // Warm cache 15 minutes before predicted access
      if (timeToPredictedAccess > 0 && timeToPredictedAccess < 900000) {
        const currentlyCached = await this.cacheManager.has(key);
        if (!currentlyCached && pattern.accessFrequency > 0.1) { // At least 1 access per 10 hours
          keysToWarm.push(key);
        }
      }
    }
    
    if (keysToWarm.length > 0) {
      console.log(`🔥 INVALIDATION: Predictive warming ${keysToWarm.length} keys`);
      
      // Use registered warming strategies
      for (const key of keysToWarm) {
        const strategy = this.getWarmingStrategy(key);
        if (strategy) {
          try {
            const value = await strategy.warmingFunction(key);
            if (value !== null) {
              await this.cacheManager.set(key, value, strategy.options);
            }
          } catch (error) {
            console.error(`❌ INVALIDATION: Error warming key ${key}:`, error);
          }
        }
      }
    }
  }

  registerWarmingStrategy(keyPattern, warmingFunction, options = {}) {
    this.warmingStrategies.set(keyPattern, {
      warmingFunction,
      options,
      pattern: new RegExp(keyPattern)
    });
    
    console.log(`🔥 INVALIDATION: Registered warming strategy for pattern: ${keyPattern}`);
  }

  getWarmingStrategy(key) {
    for (const [pattern, strategy] of this.warmingStrategies) {
      if (strategy.pattern.test(key)) {
        return strategy;
      }
    }
    return null;
  }

  /**
   * Core Invalidation Method
   */
  async invalidateKey(key, options = {}) {
    const { reason = 'manual', delay = this.options.invalidationDelay } = options;
    
    if (delay > 0) {
      setTimeout(() => this.performInvalidation(key, reason), delay);
    } else {
      await this.performInvalidation(key, reason);
    }
  }

  async performInvalidation(key, reason) {
    try {
      // Remove from cache
      await this.cacheManager.delete(key);
      
      // Clean up tracking data
      this.removeKeyFromTags(key);
      this.removeDependencyData(key);
      
      console.log(`🗑️  INVALIDATION: Invalidated key ${key} (reason: ${reason})`);
      this.emit('key-invalidated', { key, reason, timestamp: Date.now() });
      
    } catch (error) {
      console.error(`❌ INVALIDATION: Error invalidating key ${key}:`, error);
    }
  }

  removeDependencyData(key) {
    // Remove from dependencies
    const dependencies = this.dependencies.get(key);
    if (dependencies) {
      for (const dep of dependencies) {
        const dependents = this.dependents.get(dep);
        if (dependents) {
          dependents.delete(key);
          if (dependents.size === 0) {
            this.dependents.delete(dep);
          }
        }
      }
      this.dependencies.delete(key);
    }
    
    // Remove from dependents
    const dependents = this.dependents.get(key);
    if (dependents) {
      for (const dependent of dependents) {
        const deps = this.dependencies.get(dependent);
        if (deps) {
          deps.delete(key);
          if (deps.size === 0) {
            this.dependencies.delete(dependent);
          }
        }
      }
      this.dependents.delete(key);
    }
  }

  /**
   * Default Invalidation Strategies
   */
  initializeDefaultStrategies() {
    // Room-based invalidation
    this.onEvent('room-updated', {
      type: 'tag',
      target: 'room',
      event: 'room-updated'
    });
    
    this.onEvent('user-joined', {
      type: 'function',
      target: (eventData) => [
        `room:${eventData.roomId}:users`,
        `room:${eventData.roomId}:count`
      ],
      event: 'user-joined'
    });
    
    this.onEvent('user-left', {
      type: 'function',
      target: (eventData) => [
        `room:${eventData.roomId}:users`,
        `room:${eventData.roomId}:count`,
        `user:${eventData.userId}:rooms`
      ],
      event: 'user-left'
    });
    
    // Message invalidation
    this.onEvent('message-sent', {
      type: 'tag',
      target: 'messages',
      event: 'message-sent'
    });
    
    // Register warming strategies
    this.registerWarmingStrategy(
      'room:.*:users',
      async (key) => {
        const roomId = key.split(':')[1];
        // This would integrate with your room service
        return null; // Placeholder
      }
    );
    
    this.registerWarmingStrategy(
      'user:.*:profile',
      async (key) => {
        const userId = key.split(':')[1];
        // This would integrate with your user service
        return null; // Placeholder
      }
    );
  }

  /**
   * Pattern Analysis and Monitoring
   */
  startPatternAnalysis() {
    // Analyze access patterns every 30 minutes
    setInterval(() => {
      this.analyzeAccessPatterns();
    }, 30 * 60 * 1000);
    
    // Perform predictive warming every 10 minutes
    setInterval(() => {
      this.performPredictiveWarming();
    }, 10 * 60 * 1000);
  }

  analyzeAccessPatterns() {
    console.log('📊 INVALIDATION: Analyzing access patterns...');
    
    const now = Date.now();
    let totalKeys = 0;
    let activeKeys = 0;
    let highFrequencyKeys = 0;
    
    for (const [key, pattern] of this.accessPatterns) {
      totalKeys++;
      
      // Consider key active if accessed in last hour
      if (now - pattern.lastAccess < 3600000) {
        activeKeys++;
      }
      
      // High frequency: more than 1 access per hour
      if (pattern.accessFrequency > 1) {
        highFrequencyKeys++;
      }
      
      // Remove old patterns (not accessed in 24 hours)
      if (now - pattern.lastAccess > 86400000) {
        this.accessPatterns.delete(key);
      }
    }
    
    console.log(`📊 INVALIDATION: Pattern analysis - Total: ${totalKeys}, Active: ${activeKeys}, High-freq: ${highFrequencyKeys}`);
    
    this.emit('pattern-analysis', {
      totalKeys,
      activeKeys,
      highFrequencyKeys,
      timestamp: now
    });
  }

  /**
   * API Methods
   */
  getStats() {
    return {
      tags: {
        totalTags: this.tagToKeys.size,
        totalTaggedKeys: this.keyToTags.size
      },
      dependencies: {
        totalDependencies: this.dependencies.size,
        totalDependents: this.dependents.size
      },
      patterns: {
        totalTrackedKeys: this.accessPatterns.size,
        warmingStrategies: this.warmingStrategies.size
      },
      events: {
        registeredEvents: this.eventInvalidations.size
      }
    };
  }

  getAccessPattern(key) {
    return this.accessPatterns.get(key);
  }

  getKeyTags(key) {
    return this.keyToTags.get(key);
  }

  getKeyDependencies(key) {
    return this.dependencies.get(key);
  }

  getKeyDependents(key) {
    return this.dependents.get(key);
  }
}

module.exports = CacheInvalidationManager;