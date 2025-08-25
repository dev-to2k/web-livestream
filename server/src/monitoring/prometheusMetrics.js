const client = require('prom-client');
const os = require('os');
const process = require('process');

/**
 * Prometheus Metrics Manager
 * 
 * Comprehensive metrics collection for:
 * - WebSocket connections and events
 * - Room and user statistics
 * - Message throughput and latency
 * - Cache performance
 * - SFU media metrics
 * - System resources
 * - Application performance
 */
class PrometheusMetrics {
  constructor(options = {}) {
    this.options = {
      prefix: options.prefix || 'livestream_',
      collectDefaultMetrics: options.collectDefaultMetrics !== false,
      collectInterval: options.collectInterval || 10000, // 10 seconds
      enableDetailedMetrics: options.enableDetailedMetrics !== false,
      ...options
    };
    
    // Initialize Prometheus registry
    this.register = new client.Registry();
    
    // Collect default Node.js metrics
    if (this.options.collectDefaultMetrics) {
      client.collectDefaultMetrics({
        register: this.register,
        prefix: this.options.prefix,
        gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
      });
    }
    
    this.initializeMetrics();
    this.startSystemMetricsCollection();
    
    console.log('📊 METRICS: Prometheus metrics manager initialized');
  }

  initializeMetrics() {
    // Connection Metrics
    this.connectionMetrics = {
      total: new client.Gauge({
        name: `${this.options.prefix}connections_total`,
        help: 'Total number of active WebSocket connections',
        labelNames: ['server_id', 'room_id'],
        registers: [this.register]
      }),
      
      concurrent: new client.Gauge({
        name: `${this.options.prefix}concurrent_connections`,
        help: 'Current concurrent connections per room',
        labelNames: ['room_id'],
        registers: [this.register]
      }),
      
      connectionDuration: new client.Histogram({
        name: `${this.options.prefix}connection_duration_seconds`,
        help: 'Duration of WebSocket connections',
        labelNames: ['server_id', 'room_id', 'user_type'],
        buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600],
        registers: [this.register]
      }),
      
      connectionsPerSecond: new client.Counter({
        name: `${this.options.prefix}connections_per_second_total`,
        help: 'Rate of new connections per second',
        labelNames: ['server_id'],
        registers: [this.register]
      })
    };

    // Room Metrics
    this.roomMetrics = {
      active: new client.Gauge({
        name: `${this.options.prefix}rooms_active`,
        help: 'Number of active rooms',
        labelNames: ['server_id'],
        registers: [this.register]
      }),
      
      usersPerRoom: new client.Histogram({
        name: `${this.options.prefix}users_per_room`,
        help: 'Distribution of users per room',
        labelNames: ['room_id'],
        buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000],
        registers: [this.register]
      }),
      
      roomLifetime: new client.Histogram({
        name: `${this.options.prefix}room_lifetime_seconds`,
        help: 'Lifetime of rooms from creation to closure',
        labelNames: ['room_id'],
        buckets: [60, 300, 600, 1800, 3600, 7200, 14400, 28800],
        registers: [this.register]
      }),
      
      streamersPerRoom: new client.Gauge({
        name: `${this.options.prefix}streamers_per_room`,
        help: 'Number of streamers per room',
        labelNames: ['room_id'],
        registers: [this.register]
      })
    };

    // Message Metrics
    this.messageMetrics = {
      total: new client.Counter({
        name: `${this.options.prefix}messages_total`,
        help: 'Total number of messages sent',
        labelNames: ['server_id', 'room_id', 'message_type'],
        registers: [this.register]
      }),
      
      messageLatency: new client.Histogram({
        name: `${this.options.prefix}message_latency_seconds`,
        help: 'Message processing and delivery latency',
        labelNames: ['server_id', 'message_type'],
        buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
        registers: [this.register]
      }),
      
      messagesPerSecond: new client.Gauge({
        name: `${this.options.prefix}messages_per_second`,
        help: 'Current message rate per second',
        labelNames: ['server_id', 'room_id'],
        registers: [this.register]
      }),
      
      messageSize: new client.Histogram({
        name: `${this.options.prefix}message_size_bytes`,
        help: 'Distribution of message sizes',
        labelNames: ['message_type'],
        buckets: [64, 256, 512, 1024, 2048, 4096, 8192, 16384],
        registers: [this.register]
      })
    };

    // Cache Metrics
    this.cacheMetrics = {
      hits: new client.Counter({
        name: `${this.options.prefix}cache_hits_total`,
        help: 'Number of cache hits',
        labelNames: ['cache_level', 'key_type'],
        registers: [this.register]
      }),
      
      misses: new client.Counter({
        name: `${this.options.prefix}cache_misses_total`,
        help: 'Number of cache misses',
        labelNames: ['cache_level', 'key_type'],
        registers: [this.register]
      }),
      
      operations: new client.Counter({
        name: `${this.options.prefix}cache_operations_total`,
        help: 'Total cache operations',
        labelNames: ['operation', 'cache_level'],
        registers: [this.register]
      }),
      
      memoryUsage: new client.Gauge({
        name: `${this.options.prefix}cache_memory_bytes`,
        help: 'Cache memory usage in bytes',
        labelNames: ['cache_level'],
        registers: [this.register]
      }),
      
      hitRate: new client.Gauge({
        name: `${this.options.prefix}cache_hit_rate`,
        help: 'Cache hit rate percentage',
        labelNames: ['cache_level'],
        registers: [this.register]
      })
    };

    // SFU Media Metrics
    this.mediaMetrics = {
      producers: new client.Gauge({
        name: `${this.options.prefix}media_producers_active`,
        help: 'Number of active media producers',
        labelNames: ['sfu_server', 'media_kind'],
        registers: [this.register]
      }),
      
      consumers: new client.Gauge({
        name: `${this.options.prefix}media_consumers_active`,
        help: 'Number of active media consumers',
        labelNames: ['sfu_server', 'media_kind'],
        registers: [this.register]
      }),
      
      bitrate: new client.Gauge({
        name: `${this.options.prefix}media_bitrate_bps`,
        help: 'Media bitrate in bits per second',
        labelNames: ['sfu_server', 'media_kind', 'direction'],
        registers: [this.register]
      }),
      
      packetLoss: new client.Gauge({
        name: `${this.options.prefix}media_packet_loss_rate`,
        help: 'Media packet loss rate',
        labelNames: ['sfu_server', 'peer_id'],
        registers: [this.register]
      }),
      
      rtt: new client.Gauge({
        name: `${this.options.prefix}media_rtt_seconds`,
        help: 'Media round-trip time',
        labelNames: ['sfu_server', 'peer_id'],
        registers: [this.register]
      }),
      
      qualityChanges: new client.Counter({
        name: `${this.options.prefix}adaptive_quality_changes_total`,
        help: 'Number of adaptive quality changes',
        labelNames: ['sfu_server', 'from_quality', 'to_quality', 'reason'],
        registers: [this.register]
      })
    };

    // Performance Metrics
    this.performanceMetrics = {
      requestDuration: new client.Histogram({
        name: `${this.options.prefix}http_request_duration_seconds`,
        help: 'HTTP request duration',
        labelNames: ['method', 'route', 'status_code'],
        buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
        registers: [this.register]
      }),
      
      eventLoopLag: new client.Gauge({
        name: `${this.options.prefix}event_loop_lag_seconds`,
        help: 'Event loop lag in seconds',
        registers: [this.register]
      }),
      
      errorRate: new client.Counter({
        name: `${this.options.prefix}errors_total`,
        help: 'Total number of errors',
        labelNames: ['error_type', 'component'],
        registers: [this.register]
      })
    };

    // System Metrics
    this.systemMetrics = {
      cpuUsage: new client.Gauge({
        name: `${this.options.prefix}cpu_usage_percent`,
        help: 'CPU usage percentage',
        registers: [this.register]
      }),
      
      memoryUsage: new client.Gauge({
        name: `${this.options.prefix}memory_usage_bytes`,
        help: 'Memory usage in bytes',
        labelNames: ['type'],
        registers: [this.register]
      }),
      
      activeHandles: new client.Gauge({
        name: `${this.options.prefix}active_handles`,
        help: 'Number of active handles',
        registers: [this.register]
      }),
      
      activeRequests: new client.Gauge({
        name: `${this.options.prefix}active_requests`,
        help: 'Number of active requests',
        registers: [this.register]
      })
    };

    // Rate Limiting Metrics
    this.rateLimitMetrics = {
      requests: new client.Counter({
        name: `${this.options.prefix}rate_limit_requests_total`,
        help: 'Total requests processed by rate limiter',
        labelNames: ['user_type', 'endpoint'],
        registers: [this.register]
      }),
      
      blocked: new client.Counter({
        name: `${this.options.prefix}rate_limit_blocked_total`,
        help: 'Total requests blocked by rate limiter',
        labelNames: ['user_type', 'endpoint', 'reason'],
        registers: [this.register]
      }),
      
      currentLoad: new client.Gauge({
        name: `${this.options.prefix}rate_limit_current_load`,
        help: 'Current rate limiting load',
        labelNames: ['user_type', 'endpoint'],
        registers: [this.register]
      })
    };
  }

  /**
   * Connection Metrics Methods
   */
  incrementConnection(serverId, roomId = 'unknown') {
    this.connectionMetrics.total.inc({ server_id: serverId, room_id: roomId });
    this.connectionMetrics.connectionsPerSecond.inc({ server_id: serverId });
  }

  decrementConnection(serverId, roomId = 'unknown') {
    this.connectionMetrics.total.dec({ server_id: serverId, room_id: roomId });
  }

  setConcurrentConnections(roomId, count) {
    this.connectionMetrics.concurrent.set({ room_id: roomId }, count);
  }

  recordConnectionDuration(serverId, roomId, userType, duration) {
    this.connectionMetrics.connectionDuration.observe(
      { server_id: serverId, room_id: roomId, user_type: userType },
      duration
    );
  }

  /**
   * Room Metrics Methods
   */
  setActiveRooms(serverId, count) {
    this.roomMetrics.active.set({ server_id: serverId }, count);
  }

  recordUsersPerRoom(roomId, userCount) {
    this.roomMetrics.usersPerRoom.observe({ room_id: roomId }, userCount);
  }

  recordRoomLifetime(roomId, lifetime) {
    this.roomMetrics.roomLifetime.observe({ room_id: roomId }, lifetime);
  }

  setStreamersPerRoom(roomId, count) {
    this.roomMetrics.streamersPerRoom.set({ room_id: roomId }, count);
  }

  /**
   * Message Metrics Methods
   */
  incrementMessage(serverId, roomId, messageType) {
    this.messageMetrics.total.inc({
      server_id: serverId,
      room_id: roomId,
      message_type: messageType
    });
  }

  recordMessageLatency(serverId, messageType, latency) {
    this.messageMetrics.messageLatency.observe(
      { server_id: serverId, message_type: messageType },
      latency
    );
  }

  setMessageRate(serverId, roomId, rate) {
    this.messageMetrics.messagesPerSecond.set(
      { server_id: serverId, room_id: roomId },
      rate
    );
  }

  recordMessageSize(messageType, size) {
    this.messageMetrics.messageSize.observe({ message_type: messageType }, size);
  }

  /**
   * Cache Metrics Methods
   */
  incrementCacheHit(level, keyType) {
    this.cacheMetrics.hits.inc({ cache_level: level, key_type: keyType });
  }

  incrementCacheMiss(level, keyType) {
    this.cacheMetrics.misses.inc({ cache_level: level, key_type: keyType });
  }

  incrementCacheOperation(operation, level) {
    this.cacheMetrics.operations.inc({ operation, cache_level: level });
  }

  setCacheMemoryUsage(level, bytes) {
    this.cacheMetrics.memoryUsage.set({ cache_level: level }, bytes);
  }

  setCacheHitRate(level, rate) {
    this.cacheMetrics.hitRate.set({ cache_level: level }, rate);
  }

  /**
   * Media Metrics Methods
   */
  setMediaProducers(sfuServer, mediaKind, count) {
    this.mediaMetrics.producers.set(
      { sfu_server: sfuServer, media_kind: mediaKind },
      count
    );
  }

  setMediaConsumers(sfuServer, mediaKind, count) {
    this.mediaMetrics.consumers.set(
      { sfu_server: sfuServer, media_kind: mediaKind },
      count
    );
  }

  setMediaBitrate(sfuServer, mediaKind, direction, bitrate) {
    this.mediaMetrics.bitrate.set(
      { sfu_server: sfuServer, media_kind: mediaKind, direction },
      bitrate
    );
  }

  setPacketLoss(sfuServer, peerId, rate) {
    this.mediaMetrics.packetLoss.set(
      { sfu_server: sfuServer, peer_id: peerId },
      rate
    );
  }

  setRTT(sfuServer, peerId, rtt) {
    this.mediaMetrics.rtt.set(
      { sfu_server: sfuServer, peer_id: peerId },
      rtt
    );
  }

  incrementQualityChange(sfuServer, fromQuality, toQuality, reason) {
    this.mediaMetrics.qualityChanges.inc({
      sfu_server: sfuServer,
      from_quality: fromQuality,
      to_quality: toQuality,
      reason
    });
  }

  /**
   * Performance Metrics Methods
   */
  recordRequestDuration(method, route, statusCode, duration) {
    this.performanceMetrics.requestDuration.observe(
      { method, route, status_code: statusCode },
      duration
    );
  }

  setEventLoopLag(lag) {
    this.performanceMetrics.eventLoopLag.set(lag);
  }

  incrementError(errorType, component) {
    this.performanceMetrics.errorRate.inc({ error_type: errorType, component });
  }

  /**
   * Rate Limiting Metrics Methods
   */
  incrementRateLimitRequest(userType, endpoint) {
    this.rateLimitMetrics.requests.inc({ user_type: userType, endpoint });
  }

  incrementRateLimitBlocked(userType, endpoint, reason) {
    this.rateLimitMetrics.blocked.inc({
      user_type: userType,
      endpoint,
      reason
    });
  }

  setRateLimitLoad(userType, endpoint, load) {
    this.rateLimitMetrics.currentLoad.set(
      { user_type: userType, endpoint },
      load
    );
  }

  /**
   * System Metrics Collection
   */
  startSystemMetricsCollection() {
    setInterval(() => {
      this.collectSystemMetrics();
    }, this.options.collectInterval);
  }

  collectSystemMetrics() {
    try {
      // CPU Usage
      const cpuUsage = process.cpuUsage();
      const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
      this.systemMetrics.cpuUsage.set(cpuPercent);

      // Memory Usage
      const memUsage = process.memoryUsage();
      this.systemMetrics.memoryUsage.set({ type: 'rss' }, memUsage.rss);
      this.systemMetrics.memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
      this.systemMetrics.memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
      this.systemMetrics.memoryUsage.set({ type: 'external' }, memUsage.external);

      // Active handles and requests
      this.systemMetrics.activeHandles.set(process._getActiveHandles().length);
      this.systemMetrics.activeRequests.set(process._getActiveRequests().length);

      // Event loop lag
      const start = process.hrtime();
      setImmediate(() => {
        const lag = process.hrtime(start);
        const lagMs = lag[0] * 1000 + lag[1] * 1e-6;
        this.performanceMetrics.eventLoopLag.set(lagMs / 1000);
      });

    } catch (error) {
      console.error('❌ METRICS: Error collecting system metrics:', error);
    }
  }

  /**
   * HTTP Middleware for Request Metrics
   */
  createHttpMiddleware() {
    return (req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        this.recordRequestDuration(
          req.method,
          req.route ? req.route.path : req.path,
          res.statusCode,
          duration
        );
      });
      
      next();
    };
  }

  /**
   * Express Metrics Endpoint
   */
  createMetricsEndpoint() {
    return async (req, res) => {
      try {
        res.set('Content-Type', this.register.contentType);
        const metrics = await this.register.metrics();
        res.end(metrics);
      } catch (error) {
        console.error('❌ METRICS: Error generating metrics:', error);
        res.status(500).end('Error generating metrics');
      }
    };
  }

  /**
   * Custom Metrics Collection
   */
  async collectCustomMetrics(cacheService, roomManager, userManager) {
    try {
      if (cacheService) {
        const cacheStats = cacheService.getPerformanceStats();
        
        // L1 Cache metrics
        this.setCacheHitRate('l1', parseFloat(cacheStats.cache.l1.hitRate));
        this.setCacheMemoryUsage('l1', cacheStats.cache.l1.memoryUsage || 0);
        
        // L2 Cache metrics
        this.setCacheHitRate('l2', parseFloat(cacheStats.cache.l2.hitRate));
        
        // Total cache metrics
        this.setCacheHitRate('total', parseFloat(cacheStats.cache.total.hitRate));
      }

      if (roomManager && roomManager.getRoomStats) {
        const roomStats = roomManager.getRoomStats();
        this.setActiveRooms('main', roomStats.activeRooms || 0);
      }

    } catch (error) {
      console.error('❌ METRICS: Error collecting custom metrics:', error);
    }
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.register.clear();
    this.initializeMetrics();
  }

  /**
   * Get current metrics as JSON
   */
  async getMetricsAsJSON() {
    const metrics = await this.register.getMetricsAsJSON();
    return metrics;
  }

  /**
   * Health check for metrics system
   */
  healthCheck() {
    try {
      const metricCount = this.register.getSingleMetric ? 
        Object.keys(this.register._metrics || {}).length : 0;
      
      return {
        healthy: true,
        metricsCount: metricCount,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
}

module.exports = PrometheusMetrics;