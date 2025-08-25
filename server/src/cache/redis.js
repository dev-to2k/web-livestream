const Redis = require('ioredis');
const { promisify } = require('util');

class RedisManager {
  constructor() {
    this.cluster = null;
    this.pubClient = null;
    this.subClient = null;
    this.isConnected = false;
    this.subscribers = new Map();
    this.healthCheckInterval = null;
    
    // Cache configuration
    this.defaultTTL = 300; // 5 minutes
    this.longTTL = 3600; // 1 hour
    this.shortTTL = 60; // 1 minute
  }

  async connect() {
    try {
      console.log('🔵 REDIS: Connecting to Redis cluster...');

      const redisConfig = this.getRedisConfig();
      
      // Create cluster connection
      this.cluster = new Redis.Cluster(redisConfig.nodes, redisConfig.options);
      
      // Create dedicated pub/sub clients
      this.pubClient = new Redis.Cluster(redisConfig.nodes, {
        ...redisConfig.options,
        enableReadyCheck: false,
        maxRetriesPerRequest: null
      });
      
      this.subClient = new Redis.Cluster(redisConfig.nodes, {
        ...redisConfig.options,
        enableReadyCheck: false,
        maxRetriesPerRequest: null
      });

      // Setup event listeners
      this.setupEventListeners();
      
      // Wait for connections
      await Promise.all([
        this.waitForConnection(this.cluster, 'cluster'),
        this.waitForConnection(this.pubClient, 'pub'),
        this.waitForConnection(this.subClient, 'sub')
      ]);

      this.isConnected = true;
      console.log('✅ REDIS: Successfully connected to Redis cluster');
      
      // Start health monitoring
      this.startHealthCheck();
      
      return true;
    } catch (error) {
      console.error('❌ REDIS: Failed to connect to Redis cluster:', error.message);
      this.isConnected = false;
      
      // Retry connection
      setTimeout(() => this.connect(), 5000);
      return false;
    }
  }

  getRedisConfig() {
    const clusterUrls = process.env.REDIS_CLUSTER_URLS?.split(',') || [
      'localhost:6379',
      'localhost:6380',
      'localhost:6381'
    ];

    const nodes = clusterUrls.map(url => {
      const [host, port] = url.split(':');
      return { host, port: parseInt(port) };
    });

    const options = {
      // Connection settings
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      
      // Pool settings
      lazyConnect: false,
      keepAlive: 30000,
      
      // Cluster settings
      enableOfflineQueue: false,
      redisOptions: {
        password: process.env.REDIS_PASSWORD,
        db: 0,
        keyPrefix: 'livestream:',
        connectTimeout: 10000,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100
      },
      
      // Failover settings
      scaleReads: 'slave',
      readOnly: false,
      maxRedirections: 16,
      
      // Error handling
      clusterRetryDelay: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3
    };

    return { nodes, options };
  }

  setupEventListeners() {
    // Cluster events
    this.cluster.on('connect', () => {
      console.log('✅ REDIS: Cluster connected');
    });

    this.cluster.on('error', (error) => {
      console.error('❌ REDIS: Cluster error:', error.message);
      this.isConnected = false;
    });

    this.cluster.on('close', () => {
      console.warn('⚠️ REDIS: Cluster connection closed');
      this.isConnected = false;
    });

    this.cluster.on('reconnecting', () => {
      console.log('🔄 REDIS: Cluster reconnecting...');
    });

    // Pub/Sub events
    this.subClient.on('error', (error) => {
      console.error('❌ REDIS: Subscriber error:', error.message);
    });

    this.pubClient.on('error', (error) => {
      console.error('❌ REDIS: Publisher error:', error.message);
    });

    // Message handling
    this.subClient.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });

    this.subClient.on('pmessage', (pattern, channel, message) => {
      this.handlePatternMessage(pattern, channel, message);
    });
  }

  async waitForConnection(client, name) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`${name} connection timeout`));
      }, 10000);

      client.on('ready', () => {
        clearTimeout(timeout);
        console.log(`✅ REDIS: ${name} client ready`);
        resolve();
      });

      client.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.ping();
      } catch (error) {
        console.error('❌ REDIS: Health check failed:', error.message);
        this.isConnected = false;
      }
    }, 30000);
  }

  async ping() {
    try {
      const result = await this.cluster.ping();
      return result === 'PONG';
    } catch (error) {
      throw new Error(`Redis ping failed: ${error.message}`);
    }
  }

  // Caching methods with TTL management
  async set(key, value, ttl = this.defaultTTL) {
    try {
      const serialized = JSON.stringify(value);
      if (ttl > 0) {
        return await this.cluster.setex(key, ttl, serialized);
      } else {
        return await this.cluster.set(key, serialized);
      }
    } catch (error) {
      console.error('❌ REDIS: Set error:', error.message);
      return false;
    }
  }

  async get(key) {
    try {
      const value = await this.cluster.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('❌ REDIS: Get error:', error.message);
      return null;
    }
  }

  async del(key) {
    try {
      return await this.cluster.del(key);
    } catch (error) {
      console.error('❌ REDIS: Delete error:', error.message);
      return 0;
    }
  }

  async exists(key) {
    try {
      return await this.cluster.exists(key);
    } catch (error) {
      console.error('❌ REDIS: Exists error:', error.message);
      return false;
    }
  }

  // Hash operations for complex objects
  async hset(key, field, value, ttl = this.defaultTTL) {
    try {
      const serialized = JSON.stringify(value);
      const result = await this.cluster.hset(key, field, serialized);
      if (ttl > 0) {
        await this.cluster.expire(key, ttl);
      }
      return result;
    } catch (error) {
      console.error('❌ REDIS: Hash set error:', error.message);
      return false;
    }
  }

  async hget(key, field) {
    try {
      const value = await this.cluster.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('❌ REDIS: Hash get error:', error.message);
      return null;
    }
  }

  async hgetall(key) {
    try {
      const hash = await this.cluster.hgetall(key);
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch (e) {
          result[field] = value;
        }
      }
      return result;
    } catch (error) {
      console.error('❌ REDIS: Hash get all error:', error.message);
      return {};
    }
  }

  async hdel(key, field) {
    try {
      return await this.cluster.hdel(key, field);
    } catch (error) {
      console.error('❌ REDIS: Hash delete error:', error.message);
      return 0;
    }
  }

  // Set operations for managing collections
  async sadd(key, member, ttl = this.defaultTTL) {
    try {
      const result = await this.cluster.sadd(key, member);
      if (ttl > 0) {
        await this.cluster.expire(key, ttl);
      }
      return result;
    } catch (error) {
      console.error('❌ REDIS: Set add error:', error.message);
      return 0;
    }
  }

  async srem(key, member) {
    try {
      return await this.cluster.srem(key, member);
    } catch (error) {
      console.error('❌ REDIS: Set remove error:', error.message);
      return 0;
    }
  }

  async smembers(key) {
    try {
      return await this.cluster.smembers(key);
    } catch (error) {
      console.error('❌ REDIS: Set members error:', error.message);
      return [];
    }
  }

  async scard(key) {
    try {
      return await this.cluster.scard(key);
    } catch (error) {
      console.error('❌ REDIS: Set cardinality error:', error.message);
      return 0;
    }
  }

  // Pub/Sub methods
  async publish(channel, message) {
    try {
      const serialized = JSON.stringify({
        timestamp: Date.now(),
        serverId: process.env.SERVER_ID || 'unknown',
        data: message
      });
      return await this.pubClient.publish(channel, serialized);
    } catch (error) {
      console.error('❌ REDIS: Publish error:', error.message);
      return 0;
    }
  }

  async subscribe(channel, callback) {
    try {
      this.subscribers.set(channel, callback);
      return await this.subClient.subscribe(channel);
    } catch (error) {
      console.error('❌ REDIS: Subscribe error:', error.message);
      return false;
    }
  }

  async unsubscribe(channel) {
    try {
      this.subscribers.delete(channel);
      return await this.subClient.unsubscribe(channel);
    } catch (error) {
      console.error('❌ REDIS: Unsubscribe error:', error.message);
      return false;
    }
  }

  async psubscribe(pattern, callback) {
    try {
      this.subscribers.set(pattern, callback);
      return await this.subClient.psubscribe(pattern);
    } catch (error) {
      console.error('❌ REDIS: Pattern subscribe error:', error.message);
      return false;
    }
  }

  handleMessage(channel, message) {
    try {
      const parsed = JSON.parse(message);
      const callback = this.subscribers.get(channel);
      if (callback) {
        callback(parsed.data, channel, parsed);
      }
    } catch (error) {
      console.error('❌ REDIS: Message handling error:', error.message);
    }
  }

  handlePatternMessage(pattern, channel, message) {
    try {
      const parsed = JSON.parse(message);
      const callback = this.subscribers.get(pattern);
      if (callback) {
        callback(parsed.data, channel, parsed);
      }
    } catch (error) {
      console.error('❌ REDIS: Pattern message handling error:', error.message);
    }
  }

  // Cache management methods
  async invalidatePattern(pattern) {
    try {
      const keys = await this.cluster.keys(pattern);
      if (keys.length > 0) {
        return await this.cluster.del(...keys);
      }
      return 0;
    } catch (error) {
      console.error('❌ REDIS: Pattern invalidation error:', error.message);
      return 0;
    }
  }

  async getMemoryUsage() {
    try {
      const info = await this.cluster.info('memory');
      const lines = info.split('\r\n');
      const memory = {};
      
      lines.forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          if (key.startsWith('used_memory')) {
            memory[key] = parseInt(value) || value;
          }
        }
      });
      
      return memory;
    } catch (error) {
      console.error('❌ REDIS: Memory usage error:', error.message);
      return {};
    }
  }

  async getHealthData() {
    try {
      const [ping, info, memory] = await Promise.all([
        this.ping(),
        this.cluster.info('replication'),
        this.getMemoryUsage()
      ]);

      return {
        status: this.isConnected && ping ? 'healthy' : 'unhealthy',
        connected: this.isConnected,
        ping: ping,
        memory: memory,
        info: info,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async disconnect() {
    console.log('🔵 REDIS: Closing Redis connections...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    try {
      await Promise.all([
        this.cluster?.quit(),
        this.pubClient?.quit(),
        this.subClient?.quit()
      ]);
      
      console.log('✅ REDIS: All Redis connections closed');
      this.isConnected = false;
    } catch (error) {
      console.error('❌ REDIS: Error closing Redis connections:', error);
    }
  }
}

// Singleton instance
const redisManager = new RedisManager();

module.exports = redisManager;