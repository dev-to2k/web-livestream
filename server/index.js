#!/usr/bin/env node

/**
 * High-Performance Scalable Live Streaming Server
 * 
 * This server is designed to handle 1000+ concurrent users with:
 * - Horizontal scaling with clustering
 * - Redis pub/sub for cross-server communication
 * - MongoDB with sharding for persistent storage
 * - Multi-level caching (L1, L2, L3)
 * - SFU media routing with mediasoup
 * - Comprehensive monitoring and metrics
 * - Rate limiting and DDoS protection
 */

const ScalableStreamingServer = require('./src/server');
const databaseManager = require('./src/database/connection');
const redisManager = require('./src/cache/redis');

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ FATAL: Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ FATAL: Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 SERVER: Received SIGINT, starting graceful shutdown...');
  await gracefulShutdown();
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 SERVER: Received SIGTERM, starting graceful shutdown...');
  await gracefulShutdown();
});

async function gracefulShutdown() {
  try {
    console.log('🔄 SERVER: Closing database connections...');
    await Promise.all([
      databaseManager.disconnect(),
      redisManager.disconnect()
    ]);
    
    console.log('✅ SERVER: Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ SERVER: Error during shutdown:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  console.log('🚀 STARTUP: Initializing High-Performance Scalable Live Streaming Server');
  console.log('📊 FEATURES: Clustering, Redis Pub/Sub, MongoDB Sharding, SFU Media Routing');
  console.log('⚡ TARGET: 1000+ concurrent users per room without lag');
  
  const server = new ScalableStreamingServer();
  server.start().catch((error) => {
    console.error('❌ STARTUP: Failed to start server:', error);
    process.exit(1);
  });
}