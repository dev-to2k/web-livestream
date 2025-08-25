const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mediasoup = require('mediasoup');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');

// Import monitoring and Redis
const MetricsCollector = require('../server/src/monitoring/metrics');
const redisManager = require('../server/src/cache/redis');

class SFUServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Server configuration
    this.serverId = process.env.SERVER_ID || `sfu-${uuidv4()}`;
    this.port = process.env.PORT || 3478;
    
    // MediaSoup configuration
    this.worker = null;
    this.routers = new Map(); // roomId -> router
    this.transports = new Map(); // transportId -> transport
    this.producers = new Map(); // producerId -> producer
    this.consumers = new Map(); // consumerId -> consumer
    this.peers = new Map(); // peerId -> peer data
    
    // Room management
    this.rooms = new Map(); // roomId -> room data
    
    // Metrics
    this.metrics = new MetricsCollector(this.serverId);
    
    // Performance tracking
    this.stats = {
      activeRooms: 0,
      activePeers: 0,
      activeProducers: 0,
      activeConsumers: 0,
      totalBandwidth: 0
    };

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(compression());
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }));
    this.app.use(express.json({ limit: '10mb' }));
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        serverId: this.serverId,
        worker: this.worker ? 'running' : 'stopped',
        rooms: this.stats.activeRooms,
        peers: this.stats.activePeers,
        producers: this.stats.activeProducers,
        consumers: this.stats.activeConsumers,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Metrics endpoint for Prometheus
    this.app.get('/metrics', async (req, res) => {
      try {
        const metrics = await this.metrics.getMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
      } catch (error) {
        res.status(500).send('Error collecting metrics');
      }
    });

    // Router RTP capabilities
    this.app.get('/rooms/:roomId/rtp-capabilities', async (req, res) => {
      try {
        const { roomId } = req.params;
        const router = await this.getOrCreateRouter(roomId);
        
        res.json({
          rtpCapabilities: router.rtpCapabilities
        });
      } catch (error) {
        console.error('❌ SFU: Error getting RTP capabilities:', error);
        res.status(500).json({ error: 'Failed to get RTP capabilities' });
      }
    });
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 SFU: Client connected - ${socket.id}`);
      this.metrics.incrementCounter('sfu_connections_total');

      // Join room handler
      socket.on('join-sfu-room', async (data, callback) => {
        try {
          await this.handleJoinRoom(socket, data, callback);
        } catch (error) {
          console.error('❌ SFU: Error joining room:', error);
          callback({ error: error.message });
        }
      });

      // Create transport handlers
      socket.on('create-webrtc-transport', async (data, callback) => {
        try {
          await this.handleCreateTransport(socket, data, callback);
        } catch (error) {
          console.error('❌ SFU: Error creating transport:', error);
          callback({ error: error.message });
        }
      });

      // Connect transport handlers
      socket.on('connect-transport', async (data, callback) => {
        try {
          await this.handleConnectTransport(socket, data, callback);
        } catch (error) {
          console.error('❌ SFU: Error connecting transport:', error);
          callback({ error: error.message });
        }
      });

      // Producer handlers
      socket.on('produce', async (data, callback) => {
        try {
          await this.handleProduce(socket, data, callback);
        } catch (error) {
          console.error('❌ SFU: Error producing:', error);
          callback({ error: error.message });
        }
      });

      // Consumer handlers
      socket.on('consume', async (data, callback) => {
        try {
          await this.handleConsume(socket, data, callback);
        } catch (error) {
          console.error('❌ SFU: Error consuming:', error);
          callback({ error: error.message });
        }
      });

      // Resume consumer
      socket.on('consumer-resume', async (data, callback) => {
        try {
          await this.handleConsumerResume(socket, data, callback);
        } catch (error) {
          console.error('❌ SFU: Error resuming consumer:', error);
          callback({ error: error.message });
        }
      });

      // Disconnect handler
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  async initialize() {
    try {
      console.log(`🚀 SFU: Initializing SFU Server (${this.serverId})`);
      
      // Create MediaSoup worker
      await this.createWorker();
      
      // Connect to Redis for coordination
      if (redisManager) {
        await redisManager.connect();
      }
      
      // Start metrics collection
      this.metrics.start();
      
      // Setup cleanup intervals
      this.setupCleanupTasks();
      
      console.log('✅ SFU: SFU Server initialization complete');
      return true;
    } catch (error) {
      console.error('❌ SFU: Initialization failed:', error);
      throw error;
    }
  }

  async createWorker() {
    const workerSettings = {
      logLevel: process.env.MEDIASOUP_LOG_LEVEL || 'warn',
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp',
        'rtx',
        'bwe',
        'score',
        'simulcast',
        'svc'
      ],
      rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT) || 40000,
      rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT) || 40100,
    };

    this.worker = await mediasoup.createWorker(workerSettings);
    
    console.log(`✅ SFU: MediaSoup worker created [PID: ${this.worker.pid}]`);

    this.worker.on('died', (error) => {
      console.error('❌ SFU: MediaSoup worker died:', error);
      setTimeout(() => process.exit(1), 2000);
    });

    // Monitor worker resource usage
    setInterval(async () => {
      const usage = await this.worker.getResourceUsage();
      this.metrics.setGauge('sfu_worker_cpu_usage', usage.ru_utime + usage.ru_stime);
      this.metrics.setGauge('sfu_worker_memory_usage', usage.ru_maxrss);
    }, 10000);
  }

  async getOrCreateRouter(roomId) {
    if (this.routers.has(roomId)) {
      return this.routers.get(roomId);
    }

    // MediaSoup router media codecs
    const mediaCodecs = [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
          'profile-id': 2,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '4d0032',
          'level-asymmetry-allowed': 1,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
        },
      }
    ];

    const router = await this.worker.createRouter({ mediaCodecs });
    this.routers.set(roomId, router);
    
    console.log(`🎬 SFU: Created router for room ${roomId}`);
    this.metrics.incrementCounter('sfu_routers_created_total');
    
    return router;
  }

  async handleJoinRoom(socket, { roomId, peerId }, callback) {
    console.log(`🏠 SFU: Peer ${peerId} joining room ${roomId}`);
    
    // Get or create router for room
    const router = await this.getOrCreateRouter(roomId);
    
    // Store peer information
    const peer = {
      id: peerId,
      roomId,
      socketId: socket.id,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
      joinedAt: Date.now()
    };
    
    this.peers.set(peerId, peer);
    socket.peerId = peerId;
    socket.roomId = roomId;
    
    // Join socket room for coordination
    socket.join(roomId);
    
    // Update room data
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        router,
        peers: new Set(),
        createdAt: Date.now()
      });
      this.stats.activeRooms++;
    }
    
    const room = this.rooms.get(roomId);
    room.peers.add(peerId);
    this.stats.activePeers++;
    
    // Notify other peers in room
    socket.to(roomId).emit('peer-joined', { peerId });
    
    // Update metrics
    this.metrics.setGauge('sfu_active_rooms', this.stats.activeRooms);
    this.metrics.setGauge('sfu_active_peers', this.stats.activePeers);
    
    callback({
      success: true,
      rtpCapabilities: router.rtpCapabilities,
      existingPeers: Array.from(room.peers).filter(id => id !== peerId)
    });
    
    console.log(`✅ SFU: Peer ${peerId} joined room ${roomId} (${room.peers.size} peers)`);
  }

  async handleCreateTransport(socket, { type, forceTcp, producing, consuming }, callback) {
    const peerId = socket.peerId;
    const peer = this.peers.get(peerId);
    
    if (!peer) {
      throw new Error('Peer not found');
    }
    
    const room = this.rooms.get(peer.roomId);
    const router = room.router;
    
    // Transport options
    const transportOptions = {
      listenIps: [
        {
          ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
          announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || null,
        }
      ],
      enableUdp: !forceTcp,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      maxIncomingBitrate: 1500000,
    };
    
    // Create transport
    const transport = await router.createWebRtcTransport(transportOptions);
    
    // Store transport
    peer.transports.set(transport.id, transport);
    this.transports.set(transport.id, { transport, peer });
    
    // Transport event handlers
    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'failed' || dtlsState === 'closed') {
        console.log(`🔴 SFU: Transport ${transport.id} DTLS state: ${dtlsState}`);
        this.cleanupTransport(transport.id);
      }
    });
    
    transport.on('close', () => {
      console.log(`🔴 SFU: Transport ${transport.id} closed`);
      this.cleanupTransport(transport.id);
    });
    
    // Monitor transport stats
    setInterval(async () => {
      try {
        const stats = await transport.getStats();
        stats.forEach(stat => {
          if (stat.type === 'transport') {
            this.metrics.setGauge('sfu_transport_bytes_sent', stat.bytesSent, { transportId: transport.id });
            this.metrics.setGauge('sfu_transport_bytes_received', stat.bytesReceived, { transportId: transport.id });
          }
        });
      } catch (error) {
        // Transport might be closed
      }
    }, 10000);
    
    console.log(`🚛 SFU: Created ${type} transport for peer ${peerId}: ${transport.id}`);
    
    callback({
      transportOptions: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters,
      }
    });
  }

  async handleConnectTransport(socket, { transportId, dtlsParameters }, callback) {
    const transportData = this.transports.get(transportId);
    
    if (!transportData) {
      throw new Error('Transport not found');
    }
    
    await transportData.transport.connect({ dtlsParameters });
    
    console.log(`🔗 SFU: Connected transport ${transportId}`);
    callback({ success: true });
  }

  async handleProduce(socket, { transportId, kind, rtpParameters, appData }, callback) {
    const peerId = socket.peerId;
    const peer = this.peers.get(peerId);
    const transportData = this.transports.get(transportId);
    
    if (!transportData) {
      throw new Error('Transport not found');
    }
    
    // Create producer
    const producer = await transportData.transport.produce({
      kind,
      rtpParameters,
      appData: { ...appData, peerId }
    });
    
    // Store producer
    peer.producers.set(producer.id, producer);
    this.producers.set(producer.id, { producer, peer });
    this.stats.activeProducers++;
    
    // Producer event handlers
    producer.on('transportclose', () => {
      console.log(`🔴 SFU: Producer ${producer.id} transport closed`);
      this.cleanupProducer(producer.id);
    });
    
    producer.on('close', () => {
      console.log(`🔴 SFU: Producer ${producer.id} closed`);
      this.cleanupProducer(producer.id);
    });
    
    // Monitor producer stats
    setInterval(async () => {
      try {
        const stats = await producer.getStats();
        stats.forEach(stat => {
          if (stat.type === 'outbound-rtp') {
            this.metrics.setGauge('sfu_producer_bitrate', stat.bitrate || 0, { 
              producerId: producer.id, 
              kind: producer.kind 
            });
          }
        });
      } catch (error) {
        // Producer might be closed
      }
    }, 5000);
    
    // Notify other peers about new producer
    socket.to(peer.roomId).emit('new-producer', {
      peerId,
      producerId: producer.id,
      kind: producer.kind
    });
    
    console.log(`📹 SFU: Created ${kind} producer for peer ${peerId}: ${producer.id}`);
    this.metrics.incrementCounter('sfu_producers_created_total', { kind });
    this.metrics.setGauge('sfu_active_producers', this.stats.activeProducers);
    
    callback({ producerId: producer.id });
  }

  async handleConsume(socket, { transportId, producerId, rtpCapabilities }, callback) {
    const peerId = socket.peerId;
    const peer = this.peers.get(peerId);
    const room = this.rooms.get(peer.roomId);
    const router = room.router;
    const transportData = this.transports.get(transportId);
    
    if (!transportData) {
      throw new Error('Transport not found');
    }
    
    const producerData = this.producers.get(producerId);
    if (!producerData) {
      throw new Error('Producer not found');
    }
    
    const producer = producerData.producer;
    
    // Check if router can consume
    if (!router.canConsume({
      producerId: producer.id,
      rtpCapabilities,
    })) {
      throw new Error('Cannot consume');
    }
    
    // Create consumer
    const consumer = await transportData.transport.consume({
      producerId: producer.id,
      rtpCapabilities,
      paused: true, // Start paused
    });
    
    // Store consumer
    peer.consumers.set(consumer.id, consumer);
    this.consumers.set(consumer.id, { consumer, peer });
    this.stats.activeConsumers++;
    
    // Consumer event handlers
    consumer.on('transportclose', () => {
      console.log(`🔴 SFU: Consumer ${consumer.id} transport closed`);
      this.cleanupConsumer(consumer.id);
    });
    
    consumer.on('producerclose', () => {
      console.log(`🔴 SFU: Consumer ${consumer.id} producer closed`);
      this.cleanupConsumer(consumer.id);
      
      // Notify peer that producer closed
      socket.emit('producer-closed', { producerId });
    });
    
    // Monitor consumer stats
    setInterval(async () => {
      try {
        const stats = await consumer.getStats();
        stats.forEach(stat => {
          if (stat.type === 'inbound-rtp') {
            this.metrics.setGauge('sfu_consumer_bitrate', stat.bitrate || 0, { 
              consumerId: consumer.id, 
              kind: consumer.kind 
            });
          }
        });
      } catch (error) {
        // Consumer might be closed
      }
    }, 5000);
    
    console.log(`👁️ SFU: Created consumer for peer ${peerId}: ${consumer.id}`);
    this.metrics.incrementCounter('sfu_consumers_created_total', { kind: consumer.kind });
    this.metrics.setGauge('sfu_active_consumers', this.stats.activeConsumers);
    
    callback({
      consumerId: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused
    });
  }

  async handleConsumerResume(socket, { consumerId }, callback) {
    const consumerData = this.consumers.get(consumerId);
    
    if (!consumerData) {
      throw new Error('Consumer not found');
    }
    
    await consumerData.consumer.resume();
    
    console.log(`▶️ SFU: Resumed consumer ${consumerId}`);
    callback({ success: true });
  }

  handleDisconnect(socket) {
    console.log(`🔌 SFU: Client disconnected - ${socket.id}`);
    
    const peerId = socket.peerId;
    if (!peerId) return;
    
    const peer = this.peers.get(peerId);
    if (!peer) return;
    
    // Cleanup peer resources
    this.cleanupPeer(peerId);
    
    console.log(`🧹 SFU: Cleaned up peer ${peerId}`);
  }

  cleanupPeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    
    // Close all producers
    for (const [producerId, producer] of peer.producers) {
      producer.close();
      this.producers.delete(producerId);
      this.stats.activeProducers--;
    }
    
    // Close all consumers
    for (const [consumerId, consumer] of peer.consumers) {
      consumer.close();
      this.consumers.delete(consumerId);
      this.stats.activeConsumers--;
    }
    
    // Close all transports
    for (const [transportId, transport] of peer.transports) {
      transport.close();
      this.transports.delete(transportId);
    }
    
    // Remove from room
    const room = this.rooms.get(peer.roomId);
    if (room) {
      room.peers.delete(peerId);
      
      // Clean up empty room
      if (room.peers.size === 0) {
        room.router.close();
        this.routers.delete(peer.roomId);
        this.rooms.delete(peer.roomId);
        this.stats.activeRooms--;
      }
    }
    
    // Remove peer
    this.peers.delete(peerId);
    this.stats.activePeers--;
    
    // Update metrics
    this.metrics.setGauge('sfu_active_rooms', this.stats.activeRooms);
    this.metrics.setGauge('sfu_active_peers', this.stats.activePeers);
    this.metrics.setGauge('sfu_active_producers', this.stats.activeProducers);
    this.metrics.setGauge('sfu_active_consumers', this.stats.activeConsumers);
    
    // Notify other peers
    if (room) {
      this.io.to(peer.roomId).emit('peer-left', { peerId });
    }
  }

  cleanupTransport(transportId) {
    this.transports.delete(transportId);
  }

  cleanupProducer(producerId) {
    this.producers.delete(producerId);
    this.stats.activeProducers--;
    this.metrics.setGauge('sfu_active_producers', this.stats.activeProducers);
  }

  cleanupConsumer(consumerId) {
    this.consumers.delete(consumerId);
    this.stats.activeConsumers--;
    this.metrics.setGauge('sfu_active_consumers', this.stats.activeConsumers);
  }

  setupCleanupTasks() {
    // Cleanup inactive rooms every 5 minutes
    setInterval(() => {
      const now = Date.now();
      const maxAge = 30 * 60 * 1000; // 30 minutes
      
      for (const [roomId, room] of this.rooms) {
        if (room.peers.size === 0 && (now - room.createdAt) > maxAge) {
          console.log(`🧹 SFU: Cleaning up inactive room ${roomId}`);
          room.router.close();
          this.routers.delete(roomId);
          this.rooms.delete(roomId);
          this.stats.activeRooms--;
        }
      }
    }, 5 * 60 * 1000);

    // Update performance metrics every 30 seconds
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 30000);
  }

  updatePerformanceMetrics() {
    const memUsage = process.memoryUsage();
    
    this.metrics.setGauge('sfu_memory_heap_used', memUsage.heapUsed);
    this.metrics.setGauge('sfu_memory_heap_total', memUsage.heapTotal);
    this.metrics.setGauge('sfu_memory_external', memUsage.external);
    this.metrics.setGauge('sfu_memory_rss', memUsage.rss);
    
    this.metrics.setGauge('sfu_uptime_seconds', process.uptime());
  }

  async start() {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`🚀 SFU: Server running on port ${this.port}`);
          console.log(`📊 SFU: Server ID: ${this.serverId}`);
          console.log(`🎥 SFU: MediaSoup worker PID: ${this.worker.pid}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    console.log('🔄 SFU: Shutting down SFU server...');
    
    // Close all resources
    for (const peer of this.peers.values()) {
      this.cleanupPeer(peer.id);
    }
    
    // Close worker
    if (this.worker) {
      this.worker.close();
    }
    
    // Stop metrics
    this.metrics.stop();
    
    // Close server
    this.server.close();
    
    console.log('✅ SFU: SFU server shutdown complete');
  }
}

// Start server if run directly
if (require.main === module) {
  const sfuServer = new SFUServer();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    await sfuServer.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await sfuServer.stop();
    process.exit(0);
  });
  
  sfuServer.start().catch((error) => {
    console.error('❌ SFU: Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = SFUServer;