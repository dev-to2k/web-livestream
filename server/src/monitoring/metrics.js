const promClient = require('prom-client');

class MetricsCollector {
  constructor(serverId) {
    this.serverId = serverId;
    this.register = new promClient.Registry();
    
    // Add default metrics (CPU, memory, etc.)
    promClient.collectDefaultMetrics({
      register: this.register,
      prefix: 'livestream_',
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
    });

    this.initializeCustomMetrics();
  }

  initializeCustomMetrics() {
    // Connection metrics
    this.connectionGauge = new promClient.Gauge({
      name: 'livestream_active_connections',
      help: 'Number of active WebSocket connections',
      labelNames: ['server_id'],
      registers: [this.register]
    });

    this.connectionCounter = new promClient.Counter({
      name: 'livestream_connections_total',
      help: 'Total number of WebSocket connections',
      labelNames: ['server_id', 'type'],
      registers: [this.register]
    });

    this.disconnectionCounter = new promClient.Counter({
      name: 'livestream_disconnections_total',
      help: 'Total number of WebSocket disconnections',
      labelNames: ['server_id', 'reason'],
      registers: [this.register]
    });

    // Room metrics
    this.activeRoomsGauge = new promClient.Gauge({
      name: 'livestream_active_rooms',
      help: 'Number of active streaming rooms',
      labelNames: ['server_id'],
      registers: [this.register]
    });

    this.roomJoinsCounter = new promClient.Counter({
      name: 'livestream_room_joins_total',
      help: 'Total number of room joins',
      labelNames: ['server_id', 'type'],
      registers: [this.register]
    });

    this.viewersGauge = new promClient.Gauge({
      name: 'livestream_active_viewers',
      help: 'Number of active viewers across all rooms',
      labelNames: ['server_id'],
      registers: [this.register]
    });

    // Message metrics
    this.messagesCounter = new promClient.Counter({
      name: 'livestream_messages_total',
      help: 'Total number of chat messages sent',
      labelNames: ['server_id', 'room_id'],
      registers: [this.register]
    });

    this.messageLatencyHistogram = new promClient.Histogram({
      name: 'livestream_message_latency_seconds',
      help: 'Message delivery latency in seconds',
      labelNames: ['server_id'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register]
    });

    // WebRTC metrics
    this.webrtcOfferCounter = new promClient.Counter({
      name: 'livestream_webrtc_offers_total',
      help: 'Total number of WebRTC offers sent',
      labelNames: ['server_id'],
      registers: [this.register]
    });

    this.webrtcAnswerCounter = new promClient.Counter({
      name: 'livestream_webrtc_answers_total',
      help: 'Total number of WebRTC answers received',
      labelNames: ['server_id'],
      registers: [this.register]
    });

    this.webrtcConnectionsGauge = new promClient.Gauge({
      name: 'livestream_webrtc_connections',
      help: 'Number of active WebRTC connections',
      labelNames: ['server_id'],
      registers: [this.register]
    });

    this.webrtcConnectionFailuresCounter = new promClient.Counter({
      name: 'livestream_webrtc_connection_failures_total',
      help: 'Total number of WebRTC connection failures',
      labelNames: ['server_id', 'reason'],
      registers: [this.register]
    });

    // Performance metrics
    this.cpuUsageGauge = new promClient.Gauge({
      name: 'livestream_cpu_usage_percent',
      help: 'CPU usage percentage',
      labelNames: ['server_id'],
      registers: [this.register]
    });

    this.memoryUsageGauge = new promClient.Gauge({
      name: 'livestream_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['server_id', 'type'],
      registers: [this.register]
    });

    this.responseTimeHistogram = new promClient.Histogram({
      name: 'livestream_response_time_seconds',
      help: 'HTTP response time in seconds',
      labelNames: ['server_id', 'method', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register]
    });

    // Database metrics
    this.dbQueryCounter = new promClient.Counter({
      name: 'livestream_db_queries_total',
      help: 'Total number of database queries',
      labelNames: ['server_id', 'operation', 'collection'],
      registers: [this.register]
    });

    this.dbQueryDurationHistogram = new promClient.Histogram({
      name: 'livestream_db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['server_id', 'operation', 'collection'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.register]
    });

    // Redis metrics
    this.redisCommandCounter = new promClient.Counter({
      name: 'livestream_redis_commands_total',
      help: 'Total number of Redis commands',
      labelNames: ['server_id', 'command'],
      registers: [this.register]
    });

    this.redisLatencyHistogram = new promClient.Histogram({
      name: 'livestream_redis_latency_seconds',
      help: 'Redis command latency in seconds',
      labelNames: ['server_id', 'command'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.register]
    });

    // Error metrics
    this.errorsCounter = new promClient.Counter({
      name: 'livestream_errors_total',
      help: 'Total number of errors',
      labelNames: ['server_id', 'type', 'severity'],
      registers: [this.register]
    });

    // Stream quality metrics
    this.streamQualityGauge = new promClient.Gauge({
      name: 'livestream_stream_quality',
      help: 'Stream quality metrics',
      labelNames: ['server_id', 'room_id', 'metric'],
      registers: [this.register]
    });

    this.bandwidthGauge = new promClient.Gauge({
      name: 'livestream_bandwidth_bytes_per_second',
      help: 'Bandwidth usage in bytes per second',
      labelNames: ['server_id', 'direction'],
      registers: [this.register]
    });
  }

  start() {
    console.log('📊 METRICS: Starting metrics collection');
    
    // Collect system metrics every 5 seconds
    this.systemMetricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 5000);

    // Collect application metrics every 10 seconds
    this.appMetricsInterval = setInterval(() => {
      this.collectApplicationMetrics();
    }, 10000);
  }

  stop() {
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
    }
    if (this.appMetricsInterval) {
      clearInterval(this.appMetricsInterval);
    }
    console.log('📊 METRICS: Stopped metrics collection');
  }

  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    
    // Memory metrics
    this.memoryUsageGauge.set(
      { server_id: this.serverId, type: 'heap_used' },
      memUsage.heapUsed
    );
    this.memoryUsageGauge.set(
      { server_id: this.serverId, type: 'heap_total' },
      memUsage.heapTotal
    );
    this.memoryUsageGauge.set(
      { server_id: this.serverId, type: 'external' },
      memUsage.external
    );
    this.memoryUsageGauge.set(
      { server_id: this.serverId, type: 'rss' },
      memUsage.rss
    );

    // CPU usage (approximate)
    const cpuUsage = process.cpuUsage();
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    this.cpuUsageGauge.set({ server_id: this.serverId }, cpuPercent);
  }

  collectApplicationMetrics() {
    // This would be called from the main server to update app-specific metrics
    // The actual values would be passed from the server instance
  }

  // Utility methods for incrementing counters
  incrementCounter(metricName, labels = {}) {
    const metric = this[metricName];
    if (metric && typeof metric.inc === 'function') {
      metric.inc({ server_id: this.serverId, ...labels });
    }
  }

  setGauge(metricName, value, labels = {}) {
    const metric = this[metricName];
    if (metric && typeof metric.set === 'function') {
      metric.set({ server_id: this.serverId, ...labels }, value);
    }
  }

  observeHistogram(metricName, value, labels = {}) {
    const metric = this[metricName];
    if (metric && typeof metric.observe === 'function') {
      metric.observe({ server_id: this.serverId, ...labels }, value);
    }
  }

  // Timer utilities
  startTimer(metricName, labels = {}) {
    const metric = this[metricName];
    if (metric && typeof metric.startTimer === 'function') {
      return metric.startTimer({ server_id: this.serverId, ...labels });
    }
    return () => {}; // Return no-op function if metric doesn't exist
  }

  // Database query tracking
  trackDbQuery(operation, collection, duration) {
    this.incrementCounter('dbQueryCounter', { operation, collection });
    this.observeHistogram('dbQueryDurationHistogram', duration, { operation, collection });
  }

  // Redis command tracking
  trackRedisCommand(command, duration) {
    this.incrementCounter('redisCommandCounter', { command });
    this.observeHistogram('redisLatencyHistogram', duration, { command });
  }

  // Error tracking
  trackError(type, severity = 'error') {
    this.incrementCounter('errorsCounter', { type, severity });
  }

  // WebRTC tracking
  trackWebRTCOffer() {
    this.incrementCounter('webrtcOfferCounter');
  }

  trackWebRTCAnswer() {
    this.incrementCounter('webrtcAnswerCounter');
  }

  trackWebRTCConnectionFailure(reason) {
    this.incrementCounter('webrtcConnectionFailuresCounter', { reason });
  }

  // Room and user tracking
  updateActiveConnections(count) {
    this.setGauge('connectionGauge', count);
  }

  updateActiveRooms(count) {
    this.setGauge('activeRoomsGauge', count);
  }

  updateActiveViewers(count) {
    this.setGauge('viewersGauge', count);
  }

  updateWebRTCConnections(count) {
    this.setGauge('webrtcConnectionsGauge', count);
  }

  // Message tracking
  trackMessage(roomId, latency = null) {
    this.incrementCounter('messagesCounter', { room_id: roomId });
    if (latency !== null) {
      this.observeHistogram('messageLatencyHistogram', latency);
    }
  }

  // Stream quality tracking
  updateStreamQuality(roomId, metric, value) {
    this.setGauge('streamQualityGauge', value, { room_id: roomId, metric });
  }

  updateBandwidth(direction, bytesPerSecond) {
    this.setGauge('bandwidthGauge', bytesPerSecond, { direction });
  }

  // HTTP response tracking
  trackHttpResponse(method, statusCode, duration) {
    this.observeHistogram('responseTimeHistogram', duration, {
      method,
      status_code: statusCode.toString()
    });
  }

  // Get metrics for Prometheus endpoint
  getMetrics() {
    return this.register.metrics();
  }

  // Get metrics as JSON
  async getMetricsAsJSON() {
    const metrics = await this.register.getMetricsAsJSON();
    return metrics;
  }

  // Reset all metrics (useful for testing)
  reset() {
    this.register.resetMetrics();
  }
}

module.exports = MetricsCollector;