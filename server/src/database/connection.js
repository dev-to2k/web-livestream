const mongoose = require('mongoose');
const { promisify } = require('util');

class DatabaseManager {
  constructor() {
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
    this.healthCheckInterval = null;
  }

  async connect() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/livestream';
    
    const options = {
      // Connection Pool Settings
      maxPoolSize: 50, // Maximum number of connections
      minPoolSize: 5,  // Minimum number of connections
      maxIdleTimeMS: 300000, // Close connections after 5 minutes of inactivity
      serverSelectionTimeoutMS: 5000, // How long to try connecting
      socketTimeoutMS: 45000, // How long to wait for a response
      family: 4, // Use IPv4, skip trying IPv6
      
      // Replica Set Settings
      readPreference: 'secondaryPreferred', // Read from secondary when possible
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority', j: true, wtimeout: 5000 },
      
      // Buffer Settings
      bufferMaxEntries: 0, // Disable mongoose buffering
      bufferCommands: false, // Disable mongoose buffering
      
      // Other Settings
      useNewUrlParser: true,
      useUnifiedTopology: true,
      authSource: 'admin'
    };

    try {
      console.log('🔵 DATABASE: Attempting to connect to MongoDB...');
      await mongoose.connect(mongoUri, options);
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      
      console.log('✅ DATABASE: Successfully connected to MongoDB');
      
      // Start health monitoring
      this.startHealthCheck();
      
      // Setup event listeners
      this.setupEventListeners();
      
      return true;
    } catch (error) {
      console.error('❌ DATABASE: Failed to connect to MongoDB:', error.message);
      this.isConnected = false;
      
      // Retry connection
      await this.retryConnection();
      return false;
    }
  }

  async retryConnection() {
    if (this.connectionAttempts >= this.maxRetries) {
      console.error('❌ DATABASE: Maximum retry attempts reached. Exiting...');
      process.exit(1);
    }

    this.connectionAttempts++;
    console.log(`🔄 DATABASE: Retrying connection (${this.connectionAttempts}/${this.maxRetries}) in ${this.retryDelay}ms...`);
    
    setTimeout(() => {
      this.connect();
    }, this.retryDelay);
  }

  setupEventListeners() {
    mongoose.connection.on('connected', () => {
      console.log('✅ DATABASE: Mongoose connected to MongoDB');
      this.isConnected = true;
    });

    mongoose.connection.on('error', (error) => {
      console.error('❌ DATABASE: Mongoose connection error:', error);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ DATABASE: Mongoose disconnected from MongoDB');
      this.isConnected = false;
      
      // Attempt to reconnect
      setTimeout(() => {
        if (!this.isConnected) {
          console.log('🔄 DATABASE: Attempting to reconnect...');
          this.connect();
        }
      }, this.retryDelay);
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ DATABASE: Mongoose reconnected to MongoDB');
      this.isConnected = true;
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.disconnect();
      process.exit(0);
    });
  }

  startHealthCheck() {
    // Health check every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.ping();
      } catch (error) {
        console.error('❌ DATABASE: Health check failed:', error.message);
        this.isConnected = false;
      }
    }, 30000);
  }

  async ping() {
    try {
      await mongoose.connection.db.admin().ping();
      return true;
    } catch (error) {
      throw new Error(`Database ping failed: ${error.message}`);
    }
  }

  async disconnect() {
    console.log('🔵 DATABASE: Closing MongoDB connection...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    try {
      await mongoose.connection.close();
      console.log('✅ DATABASE: MongoDB connection closed');
      this.isConnected = false;
    } catch (error) {
      console.error('❌ DATABASE: Error closing MongoDB connection:', error);
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      connectionName: mongoose.connection.name,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      collections: Object.keys(mongoose.connection.collections).length
    };
  }

  async getConnectionStats() {
    try {
      if (!this.isConnected) {
        return { error: 'Database not connected' };
      }

      const admin = mongoose.connection.db.admin();
      const serverStatus = await admin.serverStatus();
      const dbStats = await mongoose.connection.db.stats();

      return {
        serverInfo: {
          version: serverStatus.version,
          uptime: serverStatus.uptime,
          connections: serverStatus.connections
        },
        database: {
          collections: dbStats.collections,
          objects: dbStats.objects,
          dataSize: dbStats.dataSize,
          storageSize: dbStats.storageSize,
          indexes: dbStats.indexes,
          indexSize: dbStats.indexSize
        },
        memory: {
          resident: serverStatus.mem?.resident || 0,
          virtual: serverStatus.mem?.virtual || 0,
          mapped: serverStatus.mem?.mapped || 0
        },
        opcounters: serverStatus.opcounters || {},
        network: serverStatus.network || {}
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  // Utility methods for database operations
  async ensureIndexes() {
    try {
      console.log('🔵 DATABASE: Ensuring indexes...');
      
      const { Room, User, Message, ConnectionState, RoomAnalytics } = require('./models');
      
      await Promise.all([
        Room.ensureIndexes(),
        User.ensureIndexes(),
        Message.ensureIndexes(),
        ConnectionState.ensureIndexes(),
        RoomAnalytics.ensureIndexes()
      ]);
      
      console.log('✅ DATABASE: All indexes created successfully');
    } catch (error) {
      console.error('❌ DATABASE: Error creating indexes:', error);
    }
  }

  async cleanupExpiredData() {
    try {
      console.log('🔵 DATABASE: Cleaning up expired data...');
      
      const { Room, User, Message, ConnectionState } = require('./models');
      
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const cleanupResults = await Promise.all([
        Room.deleteMany({ createdAt: { $lt: oneDayAgo } }),
        User.deleteMany({ createdAt: { $lt: oneDayAgo } }),
        Message.deleteMany({ timestamp: { $lt: oneDayAgo } }),
        ConnectionState.deleteMany({ createdAt: { $lt: oneHourAgo } })
      ]);

      const totalDeleted = cleanupResults.reduce((sum, result) => sum + result.deletedCount, 0);
      console.log(`✅ DATABASE: Cleaned up ${totalDeleted} expired documents`);
      
      return totalDeleted;
    } catch (error) {
      console.error('❌ DATABASE: Error during cleanup:', error);
      return 0;
    }
  }

  // Health endpoint data
  async getHealthData() {
    const status = this.getConnectionStatus();
    const stats = await this.getConnectionStats();
    
    return {
      status: this.isConnected ? 'healthy' : 'unhealthy',
      database: {
        connected: this.isConnected,
        readyState: status.readyState,
        collections: status.collections
      },
      performance: stats.serverInfo ? {
        uptime: stats.serverInfo.uptime,
        connections: stats.serverInfo.connections,
        memory: stats.memory
      } : null,
      timestamp: new Date().toISOString()
    };
  }
}

// Singleton instance
const databaseManager = new DatabaseManager();

module.exports = databaseManager;