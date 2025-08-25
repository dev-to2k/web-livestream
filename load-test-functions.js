const { faker } = require('@faker-js/faker');

// Global variables for test coordination
let roomCounter = 0;
let messageCounter = 0;
let connectionStats = {
  connected: 0,
  disconnected: 0,
  errors: 0,
  messagesSent: 0,
  messagesReceived: 0
};

// Room management
const activeRooms = new Set();
const roomDistribution = {
  popular: [], // Top 10% of rooms that get 60% of users
  normal: [],  // Regular rooms
  new: []      // New rooms being created
};

/**
 * Generate room ID with realistic distribution
 * 60% of users join popular rooms (simulating viral streams)
 * 30% join normal rooms
 * 10% join new/less popular rooms
 */
function generateRoomId(context, events, done) {
  let roomId;
  const rand = Math.random();
  
  if (rand < 0.6 && roomDistribution.popular.length > 0) {
    // Join popular room
    roomId = roomDistribution.popular[Math.floor(Math.random() * roomDistribution.popular.length)];
  } else if (rand < 0.9 && roomDistribution.normal.length > 0) {
    // Join normal room
    roomId = roomDistribution.normal[Math.floor(Math.random() * roomDistribution.normal.length)];
  } else {
    // Create new room or join less popular
    roomId = `${context.vars.roomPrefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Add to room distribution
    if (roomDistribution.normal.length < 50) {
      roomDistribution.normal.push(roomId);
    }
    
    // Promote some normal rooms to popular
    if (Math.random() < 0.1 && roomDistribution.popular.length < 10) {
      const promotedRoom = roomDistribution.normal.pop();
      if (promotedRoom) {
        roomDistribution.popular.push(promotedRoom);
      }
    }
  }
  
  context.vars.roomId = roomId;
  activeRooms.add(roomId);
  
  return done();
}

/**
 * Generate unique room ID for streamers
 */
function generateUniqueRoomId(context, events, done) {
  const uniqueId = `streamer-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  context.vars.uniqueRoomId = uniqueId;
  
  // Add to normal rooms initially
  roomDistribution.normal.push(uniqueId);
  activeRooms.add(uniqueId);
  
  return done();
}

/**
 * Generate realistic chat messages
 */
function generateChatMessage(context, events, done) {
  const messageTypes = [
    () => faker.lorem.sentence(Math.floor(Math.random() * 8) + 1),
    () => `${faker.word.adjective()} stream! ${faker.internet.emoji()}`,
    () => `LOL ${faker.internet.emoji()} ${faker.internet.emoji()}`,
    () => faker.hacker.phrase(),
    () => `${faker.word.interjection()}! This is ${faker.word.adjective()}!`,
    () => `${faker.person.firstName()} was here`,
    () => `${faker.internet.emoji()} ${faker.internet.emoji()} ${faker.internet.emoji()}`,
    () => faker.company.catchPhrase(),
    () => `${faker.word.adverb()} ${faker.word.adjective()} content!`,
    () => `First time watching, love it ${faker.internet.emoji()}`
  ];
  
  const messageGenerator = messageTypes[Math.floor(Math.random() * messageTypes.length)];
  context.vars.chatMessage = messageGenerator();
  
  return done();
}

/**
 * Generate simple messages for anonymous users
 */
function generateSimpleMessage(context, events, done) {
  const simpleMessages = [
    'hi',
    'hello',
    'nice',
    'cool',
    'wow',
    'lol',
    'good',
    '👍',
    '❤️',
    'first'
  ];
  
  context.vars.simpleMessage = simpleMessages[Math.floor(Math.random() * simpleMessages.length)];
  return done();
}

/**
 * Generate streamer responses to chat
 */
function generateStreamerResponse(context, events, done) {
  const responses = [
    'Thanks for watching!',
    'Great question!',
    'Welcome to the stream!',
    'I appreciate the support!',
    'Let me know what you think in the chat!',
    'Thanks for the follow!',
    'Hope you\'re enjoying the content!',
    'Don\'t forget to subscribe!',
    'Love the energy in chat!',
    'You guys are awesome!'
  ];
  
  context.vars.streamerMessage = responses[Math.floor(Math.random() * responses.length)];
  return done();
}

/**
 * Setup event listeners for regular users
 */
function setupEventListeners(context, events, done) {
  const ws = context.ws;
  
  // Listen for common events
  ws.on('user-joined', (data) => {
    connectionStats.messagesReceived++;
    // Simulate processing delay
    setTimeout(() => {}, Math.random() * 10);
  });
  
  ws.on('user-left', (data) => {
    connectionStats.messagesReceived++;
  });
  
  ws.on('chat-message', (data) => {
    connectionStats.messagesReceived++;
    // Simulate reading message
    setTimeout(() => {}, Math.random() * 50);
  });
  
  ws.on('stream-stats', (data) => {
    connectionStats.messagesReceived++;
  });
  
  ws.on('room-update', (data) => {
    connectionStats.messagesReceived++;
  });
  
  ws.on('quality-changed', (data) => {
    connectionStats.messagesReceived++;
    console.log(`Quality changed to: ${data.newQuality}`);
  });
  
  ws.on('error', (error) => {
    connectionStats.errors++;
    console.error('WebSocket error:', error);
  });
  
  return done();
}

/**
 * Setup event listeners for streamers
 */
function setupStreamerListeners(context, events, done) {
  const ws = context.ws;
  
  // Listen for streamer-specific events
  ws.on('viewer-joined', (data) => {
    connectionStats.messagesReceived++;
  });
  
  ws.on('chat-message', (data) => {
    connectionStats.messagesReceived++;
    // Streamers are more likely to respond to chat
    if (Math.random() < 0.3) {
      setTimeout(() => {
        ws.emit('chat-message', {
          roomId: context.vars.uniqueRoomId,
          message: 'Thanks for the message!',
          isStreamer: true
        });
      }, Math.random() * 2000 + 500);
    }
  });
  
  ws.on('stream-quality-request', (data) => {
    connectionStats.messagesReceived++;
  });
  
  ws.on('donation', (data) => {
    connectionStats.messagesReceived++;
    // Thank for donation
    setTimeout(() => {
      ws.emit('chat-message', {
        roomId: context.vars.uniqueRoomId,
        message: `Thank you ${data.username} for the donation!`,
        isStreamer: true
      });
    }, 1000);
  });
  
  return done();
}

/**
 * Generate realistic stream statistics
 */
function sendStreamStats(context, events, done) {
  const stats = {
    bitrate: Math.floor(Math.random() * 1000000) + 1500000, // 1.5-2.5 Mbps
    fps: Math.floor(Math.random() * 10) + 25, // 25-35 FPS
    resolution: '1920x1080',
    viewers: Math.floor(Math.random() * 100) + 10,
    latency: Math.floor(Math.random() * 50) + 20, // 20-70ms
    packetLoss: Math.random() * 0.05, // 0-5%
    cpu: Math.random() * 0.4 + 0.3, // 30-70%
    memory: Math.random() * 200 + 300 // 300-500MB
  };
  
  context.vars.streamStats = stats;
  return done();
}

/**
 * Record message sent for metrics
 */
function recordMessageSent(context, events, done) {
  connectionStats.messagesSent++;
  messageCounter++;
  return done();
}

/**
 * Cleanup and disconnect
 */
function cleanup(context, events, done) {
  connectionStats.disconnected++;
  
  // Remove room from active rooms if no more users
  if (context.vars.roomId) {
    // In a real scenario, we'd track user count per room
    // For simulation, randomly remove rooms
    if (Math.random() < 0.1) {
      activeRooms.delete(context.vars.roomId);
    }
  }
  
  return done();
}

/**
 * Custom metrics collection
 */
function reportMetrics(context, events, done) {
  console.log('=== Load Test Metrics ===');
  console.log(`Active Rooms: ${activeRooms.size}`);
  console.log(`Popular Rooms: ${roomDistribution.popular.length}`);
  console.log(`Normal Rooms: ${roomDistribution.normal.length}`);
  console.log(`Messages Sent: ${connectionStats.messagesSent}`);
  console.log(`Messages Received: ${connectionStats.messagesReceived}`);
  console.log(`Connections: ${connectionStats.connected}`);
  console.log(`Disconnections: ${connectionStats.disconnected}`);
  console.log(`Errors: ${connectionStats.errors}`);
  console.log('========================');
  
  return done();
}

/**
 * Simulate network conditions
 */
function simulateNetworkConditions(context, events, done) {
  // Simulate occasional network issues
  if (Math.random() < 0.05) { // 5% chance
    const delay = Math.random() * 1000 + 100; // 100-1100ms delay
    setTimeout(() => {
      done();
    }, delay);
  } else {
    done();
  }
}

/**
 * Validate response times
 */
function validatePerformance(context, events, done) {
  const startTime = Date.now();
  
  context.vars.performanceCheck = () => {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (responseTime > 100) {
      console.warn(`⚠️  High response time detected: ${responseTime}ms`);
    }
    
    // Record to custom metrics
    if (!context.vars.responseTimes) {
      context.vars.responseTimes = [];
    }
    context.vars.responseTimes.push(responseTime);
  };
  
  return done();
}

/**
 * Simulate different user behavior patterns
 */
function simulateUserBehavior(context, events, done) {
  const behaviors = {
    'lurker': { messageFrequency: 0.1, sessionLength: 0.5 },
    'active': { messageFrequency: 0.8, sessionLength: 1.2 },
    'chatty': { messageFrequency: 1.5, sessionLength: 1.0 },
    'supportive': { messageFrequency: 0.6, sessionLength: 1.8 }
  };
  
  const behaviorType = Object.keys(behaviors)[Math.floor(Math.random() * Object.keys(behaviors).length)];
  const behavior = behaviors[behaviorType];
  
  context.vars.userBehavior = behavior;
  context.vars.behaviorType = behaviorType;
  
  return done();
}

/**
 * Connection established handler
 */
function onConnect(context, events, done) {
  connectionStats.connected++;
  console.log(`✅ Connection established. Total: ${connectionStats.connected}`);
  return done();
}

/**
 * Connection error handler
 */
function onError(context, events, done) {
  connectionStats.errors++;
  console.error(`❌ Connection error. Total errors: ${connectionStats.errors}`);
  return done();
}

/**
 * Performance validation for 1000+ users
 */
function validateScalability(context, events, done) {
  const metrics = {
    totalConnections: connectionStats.connected,
    activeRooms: activeRooms.size,
    messagesPerSecond: connectionStats.messagesSent / (Date.now() / 1000),
    errorRate: connectionStats.errors / (connectionStats.connected || 1)
  };
  
  // Validate 1000+ user capacity
  if (metrics.totalConnections >= 1000) {
    console.log('🎯 TARGET ACHIEVED: 1000+ concurrent users');
  }
  
  // Validate error rate < 1%
  if (metrics.errorRate < 0.01) {
    console.log('✅ ERROR RATE: Within acceptable limits');
  } else {
    console.warn('⚠️  ERROR RATE: Above 1% threshold');
  }
  
  // Report current metrics
  context.vars.scalabilityMetrics = metrics;
  
  return done();
}

module.exports = {
  generateRoomId,
  generateUniqueRoomId,
  generateChatMessage,
  generateSimpleMessage,
  generateStreamerResponse,
  setupEventListeners,
  setupStreamerListeners,
  sendStreamStats,
  recordMessageSent,
  cleanup,
  reportMetrics,
  simulateNetworkConditions,
  validatePerformance,
  simulateUserBehavior,
  onConnect,
  onError,
  validateScalability
};