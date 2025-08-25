/**
 * Message Batching System
 * 
 * Groups non-critical messages and sends them in batches to reduce network overhead.
 * Critical messages (WebRTC signaling) are sent immediately.
 * Non-critical messages (chat, user counts, status updates) are batched.
 */

const EventEmitter = require('events');

class MessageBatcher extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Configuration
    this.config = {
      batchInterval: options.batchInterval || 100, // Send batches every 100ms
      maxBatchSize: options.maxBatchSize || 50, // Max messages per batch
      maxBatchBytes: options.maxBatchBytes || 64 * 1024, // Max 64KB per batch
      priorityFlushInterval: options.priorityFlushInterval || 50, // Priority messages flush faster
      maxQueueSize: options.maxQueueSize || 1000, // Max queued messages per room
      ...options
    };
    
    // Message queues by room
    this.roomQueues = new Map(); // roomId -> { messages: [], size: bytes, lastFlush: timestamp }
    this.globalQueue = []; // For broadcast messages
    
    // Timers
    this.batchTimer = null;
    this.priorityTimer = null;
    
    // Statistics
    this.stats = {
      totalMessagesBatched: 0,
      totalBatchesSent: 0,
      averageBatchSize: 0,
      averageLatencyReduction: 0,
      bytesSaved: 0,
      messagesDropped: 0
    };
    
    // Message priorities
    this.messagePriorities = {
      // Critical - send immediately
      'offer': 0,
      'answer': 0,
      'ice-candidate': 0,
      'connection-health': 0,
      
      // High priority - batch with short delay
      'stream-started': 1,
      'stream-ended': 1,
      'quality-changed': 1,
      
      // Medium priority - normal batching
      'chat-message': 2,
      'user-status': 2,
      
      // Low priority - can be delayed/aggregated
      'user-count': 3,
      'room-stats': 3,
      'presence': 3,
      'typing-indicator': 3
    };
    
    this.startBatching();
  }

  /**
   * Add message to batch queue
   */
  addMessage(roomId, messageType, data, options = {}) {
    const priority = this.messagePriorities[messageType] ?? 2;
    const timestamp = Date.now();
    
    // Critical messages - send immediately
    if (priority === 0) {
      this.emit('immediate-send', { roomId, messageType, data, timestamp });
      return;
    }
    
    const message = {
      id: this.generateMessageId(),
      type: messageType,
      data,
      timestamp,
      priority,
      size: this.estimateMessageSize(data),
      options
    };
    
    // Add to appropriate queue
    if (roomId) {
      this.addToRoomQueue(roomId, message);
    } else {
      this.addToGlobalQueue(message);
    }
    
    // Check if we should flush immediately
    if (priority === 1 || this.shouldFlushEarly(roomId)) {
      this.flushRoom(roomId);
    }
  }

  /**
   * Add message to room-specific queue
   */
  addToRoomQueue(roomId, message) {
    if (!this.roomQueues.has(roomId)) {
      this.roomQueues.set(roomId, {
        messages: [],
        totalSize: 0,
        lastFlush: Date.now(),
        messageCount: 0
      });
    }
    
    const queue = this.roomQueues.get(roomId);
    
    // Check queue limits
    if (queue.messages.length >= this.config.maxQueueSize) {
      // Drop oldest low-priority message
      const droppedMessage = this.dropLowPriorityMessage(queue);
      if (droppedMessage) {
        this.stats.messagesDropped++;
        console.warn(`⚠️ BATCH: Dropped message ${droppedMessage.type} in room ${roomId} (queue full)`);
      }
    }
    
    // Add message
    queue.messages.push(message);
    queue.totalSize += message.size;
    queue.messageCount++;
    
    this.stats.totalMessagesBatched++;
    
    console.log(`📦 BATCH: Queued ${message.type} for room ${roomId} (${queue.messages.length} messages, ${queue.totalSize} bytes)`);
  }

  /**
   * Add message to global broadcast queue
   */
  addToGlobalQueue(message) {
    this.globalQueue.push(message);
    console.log(`📦 BATCH: Queued ${message.type} for global broadcast (${this.globalQueue.length} messages)`);
  }

  /**
   * Check if room should be flushed early
   */
  shouldFlushEarly(roomId) {
    const queue = this.roomQueues.get(roomId);
    if (!queue) return false;
    
    return (
      queue.messages.length >= this.config.maxBatchSize ||
      queue.totalSize >= this.config.maxBatchBytes ||
      this.hasHighPriorityMessages(queue)
    );
  }

  /**
   * Check if queue has high priority messages
   */
  hasHighPriorityMessages(queue) {
    return queue.messages.some(msg => msg.priority === 1);
  }

  /**
   * Drop lowest priority message from queue
   */
  dropLowPriorityMessage(queue) {
    let lowestPriorityIndex = -1;
    let lowestPriority = -1;
    
    for (let i = 0; i < queue.messages.length; i++) {
      const msg = queue.messages[i];
      if (msg.priority > lowestPriority) {
        lowestPriority = msg.priority;
        lowestPriorityIndex = i;
      }
    }
    
    if (lowestPriorityIndex >= 0) {
      const dropped = queue.messages.splice(lowestPriorityIndex, 1)[0];
      queue.totalSize -= dropped.size;
      queue.messageCount--;
      return dropped;
    }
    
    return null;
  }

  /**
   * Start the batching system
   */
  startBatching() {
    // Main batch timer
    this.batchTimer = setInterval(() => {
      this.flushAllRooms();
      this.flushGlobalQueue();
    }, this.config.batchInterval);
    
    // Priority flush timer (for high priority messages)
    this.priorityTimer = setInterval(() => {
      this.flushPriorityMessages();
    }, this.config.priorityFlushInterval);
    
    console.log('📦 BATCH: Message batching started');
  }

  /**
   * Stop the batching system
   */
  stopBatching() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    
    if (this.priorityTimer) {
      clearInterval(this.priorityTimer);
      this.priorityTimer = null;
    }
    
    // Flush remaining messages
    this.flushAllRooms();
    this.flushGlobalQueue();
    
    console.log('📦 BATCH: Message batching stopped');
  }

  /**
   * Flush all room queues
   */
  flushAllRooms() {
    for (const [roomId, queue] of this.roomQueues) {
      if (queue.messages.length > 0) {
        this.flushRoom(roomId);
      }
    }
  }

  /**
   * Flush specific room queue
   */
  flushRoom(roomId) {
    const queue = this.roomQueues.get(roomId);
    if (!queue || queue.messages.length === 0) {
      return;
    }
    
    // Create batch
    const batch = this.createBatch(queue.messages, roomId);
    
    // Emit batch for sending
    this.emit('batch-ready', batch);
    
    // Update statistics
    this.updateStats(batch);
    
    // Clear queue
    queue.messages = [];
    queue.totalSize = 0;
    queue.lastFlush = Date.now();
    
    console.log(`📤 BATCH: Flushed room ${roomId} - ${batch.messages.length} messages, ${batch.totalSize} bytes`);
  }

  /**
   * Flush global queue
   */
  flushGlobalQueue() {
    if (this.globalQueue.length === 0) {
      return;
    }
    
    const batch = this.createBatch(this.globalQueue, null);
    this.emit('batch-ready', batch);
    this.updateStats(batch);
    
    this.globalQueue = [];
    console.log(`📤 BATCH: Flushed global queue - ${batch.messages.length} messages`);
  }

  /**
   * Flush only high priority messages
   */
  flushPriorityMessages() {
    for (const [roomId, queue] of this.roomQueues) {
      if (this.hasHighPriorityMessages(queue)) {
        // Extract priority messages
        const priorityMessages = [];
        const remainingMessages = [];
        
        let prioritySize = 0;
        
        for (const message of queue.messages) {
          if (message.priority === 1) {
            priorityMessages.push(message);
            prioritySize += message.size;
          } else {
            remainingMessages.push(message);
          }
        }
        
        if (priorityMessages.length > 0) {
          // Create priority batch
          const priorityBatch = this.createBatch(priorityMessages, roomId, true);
          this.emit('batch-ready', priorityBatch);
          this.updateStats(priorityBatch);
          
          // Update queue
          queue.messages = remainingMessages;
          queue.totalSize -= prioritySize;
          
          console.log(`⚡ BATCH: Flushed ${priorityMessages.length} priority messages for room ${roomId}`);
        }
      }
    }
  }

  /**
   * Create a message batch
   */
  createBatch(messages, roomId, isPriority = false) {
    // Group messages by type for better compression
    const messagesByType = {};
    let totalSize = 0;
    
    for (const message of messages) {
      if (!messagesByType[message.type]) {
        messagesByType[message.type] = [];
      }
      messagesByType[message.type].push(message);
      totalSize += message.size;
    }
    
    // Create batch object
    const batch = {
      id: this.generateBatchId(),
      roomId,
      isPriority,
      timestamp: Date.now(),
      messageCount: messages.length,
      totalSize,
      messagesByType,
      messages, // Keep original order
      compression: this.shouldCompress(totalSize),
      metadata: {
        batchInterval: this.config.batchInterval,
        averageLatency: this.calculateAverageLatency(messages),
        queueTime: Date.now() - Math.min(...messages.map(m => m.timestamp))
      }
    };
    
    return batch;
  }

  /**
   * Calculate average message latency
   */
  calculateAverageLatency(messages) {
    if (messages.length === 0) return 0;
    
    const now = Date.now();
    const totalLatency = messages.reduce((sum, msg) => sum + (now - msg.timestamp), 0);
    return Math.round(totalLatency / messages.length);
  }

  /**
   * Determine if batch should be compressed
   */
  shouldCompress(totalSize) {
    return totalSize > 1024; // Compress batches > 1KB
  }

  /**
   * Estimate message size in bytes
   */
  estimateMessageSize(data) {
    if (typeof data === 'string') {
      return Buffer.byteLength(data, 'utf8');
    } else if (Buffer.isBuffer(data)) {
      return data.length;
    } else {
      // Estimate JSON size
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    }
  }

  /**
   * Generate unique message ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique batch ID
   */
  generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update statistics
   */
  updateStats(batch) {
    this.stats.totalBatchesSent++;
    this.stats.averageBatchSize = (
      (this.stats.averageBatchSize * (this.stats.totalBatchesSent - 1) + batch.messageCount) /
      this.stats.totalBatchesSent
    );
    
    // Estimate bytes saved by batching
    const individualOverhead = batch.messageCount * 50; // Assume 50 bytes overhead per individual message
    const batchOverhead = 100; // Batch overhead
    this.stats.bytesSaved += Math.max(0, individualOverhead - batchOverhead);
    
    // Update average latency reduction
    const latencyReduction = Math.max(0, this.config.batchInterval - batch.metadata.averageLatency);
    this.stats.averageLatencyReduction = (
      (this.stats.averageLatencyReduction * (this.stats.totalBatchesSent - 1) + latencyReduction) /
      this.stats.totalBatchesSent
    );
  }

  /**
   * Get batching statistics
   */
  getStats() {
    const activeQueues = Array.from(this.roomQueues.entries()).filter(([_, queue]) => queue.messages.length > 0);
    
    return {
      ...this.stats,
      config: this.config,
      currentQueues: {
        rooms: this.roomQueues.size,
        activeRooms: activeQueues.length,
        globalQueueSize: this.globalQueue.length,
        totalQueuedMessages: activeQueues.reduce((sum, [_, queue]) => sum + queue.messages.length, 0) + this.globalQueue.length
      },
      performance: {
        averageBatchEfficiency: this.stats.averageBatchSize / this.config.maxBatchSize,
        bytesSavedPercentage: this.stats.bytesSaved > 0 ? 
          ((this.stats.bytesSaved / (this.stats.totalBatchesSent * 1000)) * 100).toFixed(2) : 0,
        averageLatencyReductionMs: Math.round(this.stats.averageLatencyReduction)
      }
    };
  }

  /**
   * Force flush all queues
   */
  forceFlush() {
    console.log('🔄 BATCH: Force flushing all queues');
    this.flushAllRooms();
    this.flushGlobalQueue();
  }

  /**
   * Force flush specific room
   */
  forceFlushRoom(roomId) {
    console.log(`🔄 BATCH: Force flushing room ${roomId}`);
    this.flushRoom(roomId);
  }

  /**
   * Clear all queues (for cleanup)
   */
  clearAllQueues() {
    this.roomQueues.clear();
    this.globalQueue = [];
    console.log('🧹 BATCH: Cleared all message queues');
  }

  /**
   * Get queue status for specific room
   */
  getRoomQueueStatus(roomId) {
    const queue = this.roomQueues.get(roomId);
    if (!queue) {
      return { exists: false };
    }
    
    return {
      exists: true,
      messageCount: queue.messages.length,
      totalSize: queue.totalSize,
      lastFlush: queue.lastFlush,
      timeSinceLastFlush: Date.now() - queue.lastFlush,
      averageMessageSize: queue.messages.length > 0 ? Math.round(queue.totalSize / queue.messages.length) : 0,
      messageTypes: this.getMessageTypeDistribution(queue.messages)
    };
  }

  /**
   * Get message type distribution for analytics
   */
  getMessageTypeDistribution(messages) {
    const distribution = {};
    for (const message of messages) {
      distribution[message.type] = (distribution[message.type] || 0) + 1;
    }
    return distribution;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Restart timers with new intervals
    if (newConfig.batchInterval || newConfig.priorityFlushInterval) {
      this.stopBatching();
      this.startBatching();
    }
    
    console.log('⚙️ BATCH: Configuration updated', newConfig);
  }
}

module.exports = MessageBatcher;