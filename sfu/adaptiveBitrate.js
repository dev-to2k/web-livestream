class AdaptiveBitrateManager {
  constructor(sfuServer) {
    this.sfuServer = sfuServer;
    this.clientStates = new Map(); // peerId -> client state
    this.qualityProfiles = this.initializeQualityProfiles();
    this.adaptationThresholds = this.initializeAdaptationThresholds();
    
    // Monitoring intervals
    this.monitoringInterval = null;
    this.adaptationInterval = null;
    
    this.startMonitoring();
  }

  initializeQualityProfiles() {
    return {
      ultra: {
        width: 1920,
        height: 1080,
        frameRate: 30,
        bitrate: 2500000, // 2.5 Mbps
        minBitrate: 2000000,
        maxBitrate: 3000000,
        scaleResolutionDownBy: 1
      },
      high: {
        width: 1280,
        height: 720,
        frameRate: 30,
        bitrate: 1500000, // 1.5 Mbps
        minBitrate: 1200000,
        maxBitrate: 1800000,
        scaleResolutionDownBy: 1.5
      },
      medium: {
        width: 854,
        height: 480,
        frameRate: 25,
        bitrate: 800000, // 800 Kbps
        minBitrate: 600000,
        maxBitrate: 1000000,
        scaleResolutionDownBy: 2
      },
      low: {
        width: 640,
        height: 360,
        frameRate: 20,
        bitrate: 400000, // 400 Kbps
        minBitrate: 300000,
        maxBitrate: 500000,
        scaleResolutionDownBy: 3
      },
      minimal: {
        width: 426,
        height: 240,
        frameRate: 15,
        bitrate: 200000, // 200 Kbps
        minBitrate: 150000,
        maxBitrate: 250000,
        scaleResolutionDownBy: 4
      }
    };
  }

  initializeAdaptationThresholds() {
    return {
      // Network condition thresholds
      bandwidth: {
        excellent: 5000000,  // 5 Mbps+
        good: 2000000,       // 2 Mbps
        fair: 1000000,       // 1 Mbps
        poor: 500000,        // 500 Kbps
        critical: 200000     // 200 Kbps
      },
      
      // Performance thresholds
      packetLoss: {
        excellent: 0.01,     // < 1%
        good: 0.03,          // < 3%
        fair: 0.05,          // < 5%
        poor: 0.1,           // < 10%
        critical: 0.2        // < 20%
      },
      
      // Latency thresholds (RTT in ms)
      latency: {
        excellent: 50,
        good: 100,
        fair: 200,
        poor: 500,
        critical: 1000
      },
      
      // CPU usage thresholds
      cpu: {
        excellent: 0.3,      // < 30%
        good: 0.5,           // < 50%
        fair: 0.7,           // < 70%
        poor: 0.85,          // < 85%
        critical: 0.95       // < 95%
      }
    };
  }

  startMonitoring() {
    // Monitor network and performance metrics every 5 seconds
    this.monitoringInterval = setInterval(() => {
      this.monitorClientStates();
    }, 5000);

    // Adapt quality every 10 seconds
    this.adaptationInterval = setInterval(() => {
      this.adaptAllClients();
    }, 10000);

    console.log('📊 ADAPTIVE: Started adaptive bitrate monitoring');
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.adaptationInterval) {
      clearInterval(this.adaptationInterval);
    }
    console.log('📊 ADAPTIVE: Stopped adaptive bitrate monitoring');
  }

  registerClient(peerId, clientCapabilities) {
    const clientState = {
      peerId,
      capabilities: clientCapabilities,
      currentQuality: this.selectInitialQuality(clientCapabilities),
      networkStats: {
        bandwidth: 0,
        packetLoss: 0,
        latency: 0,
        jitter: 0
      },
      performanceStats: {
        cpu: 0,
        memory: 0,
        frameRate: 0,
        droppedFrames: 0
      },
      adaptationHistory: [],
      lastAdaptation: Date.now(),
      adaptationCooldown: 15000, // 15 seconds
      degradationCount: 0,
      improvementCount: 0
    };

    this.clientStates.set(peerId, clientState);
    console.log(`👤 ADAPTIVE: Registered client ${peerId} with ${clientState.currentQuality} quality`);
    
    return clientState;
  }

  unregisterClient(peerId) {
    this.clientStates.delete(peerId);
    console.log(`👤 ADAPTIVE: Unregistered client ${peerId}`);
  }

  selectInitialQuality(capabilities) {
    // Select quality based on client capabilities
    const deviceType = this.detectDeviceType(capabilities);
    const networkType = this.detectNetworkType(capabilities);
    
    if (deviceType === 'desktop' && networkType === 'wifi') {
      return 'high';
    } else if (deviceType === 'mobile' && networkType === 'cellular') {
      return 'medium';
    } else if (networkType === 'slow') {
      return 'low';
    }
    
    return 'medium'; // Default
  }

  detectDeviceType(capabilities) {
    // Detect device type from capabilities
    const userAgent = capabilities.userAgent || '';
    const screenWidth = capabilities.screen?.width || 1920;
    
    if (/(tablet|ipad)/i.test(userAgent)) {
      return 'tablet';
    } else if (/(mobile|phone|android|ios)/i.test(userAgent)) {
      return 'mobile';
    } else if (screenWidth >= 1920) {
      return 'desktop-hd';
    }
    
    return 'desktop';
  }

  detectNetworkType(capabilities) {
    const connection = capabilities.connection;
    if (!connection) return 'unknown';
    
    const effectiveType = connection.effectiveType;
    const downlink = connection.downlink;
    
    if (effectiveType === '4g' && downlink > 10) {
      return 'wifi';
    } else if (effectiveType === '4g') {
      return 'cellular';
    } else if (effectiveType === '3g') {
      return 'slow';
    }
    
    return 'unknown';
  }

  async monitorClientStates() {
    for (const [peerId, clientState] of this.clientStates) {
      try {
        // Get peer from SFU
        const peer = this.sfuServer.peers.get(peerId);
        if (!peer) continue;

        // Update network stats from producers and consumers
        await this.updateNetworkStats(peer, clientState);
        
        // Update performance stats
        await this.updatePerformanceStats(peer, clientState);
        
        // Log stats for debugging
        this.logClientStats(peerId, clientState);
        
      } catch (error) {
        console.error(`❌ ADAPTIVE: Error monitoring client ${peerId}:`, error);
      }
    }
  }

  async updateNetworkStats(peer, clientState) {
    let totalBandwidth = 0;
    let totalPacketLoss = 0;
    let avgLatency = 0;
    let statsCount = 0;

    // Analyze producer stats (for streamers)
    for (const producer of peer.producers.values()) {
      try {
        const stats = await producer.getStats();
        for (const stat of stats) {
          if (stat.type === 'outbound-rtp') {
            totalBandwidth += stat.bitrate || 0;
            totalPacketLoss += stat.packetLossPercentage || 0;
            avgLatency += stat.roundTripTime || 0;
            statsCount++;
          }
        }
      } catch (error) {
        // Producer might be closed
      }
    }

    // Analyze consumer stats (for viewers)
    for (const consumer of peer.consumers.values()) {
      try {
        const stats = await consumer.getStats();
        for (const stat of stats) {
          if (stat.type === 'inbound-rtp') {
            totalBandwidth += stat.bitrate || 0;
            totalPacketLoss += stat.packetsLost || 0;
            avgLatency += stat.roundTripTime || 0;
            statsCount++;
          }
        }
      } catch (error) {
        // Consumer might be closed
      }
    }

    // Update client state
    if (statsCount > 0) {
      clientState.networkStats.bandwidth = totalBandwidth;
      clientState.networkStats.packetLoss = totalPacketLoss / statsCount / 100; // Convert to percentage
      clientState.networkStats.latency = avgLatency / statsCount;
    }
  }

  async updatePerformanceStats(peer, clientState) {
    // This would typically come from client-side reporting
    // For now, we'll estimate based on network conditions
    
    const networkCondition = this.assessNetworkCondition(clientState.networkStats);
    
    // Estimate CPU usage based on quality and network conditions
    const currentProfile = this.qualityProfiles[clientState.currentQuality];
    let estimatedCpu = 0.3; // Base CPU usage
    
    if (currentProfile.bitrate > 1500000) estimatedCpu += 0.2;
    if (networkCondition === 'poor' || networkCondition === 'critical') estimatedCpu += 0.3;
    
    clientState.performanceStats.cpu = Math.min(estimatedCpu, 1.0);
  }

  assessNetworkCondition(networkStats) {
    const { bandwidth, packetLoss, latency } = networkStats;
    const thresholds = this.adaptationThresholds;
    
    // Score each metric (0-4, higher is better)
    let bandwidthScore = 0;
    let packetLossScore = 0;
    let latencyScore = 0;
    
    // Bandwidth scoring
    if (bandwidth >= thresholds.bandwidth.excellent) bandwidthScore = 4;
    else if (bandwidth >= thresholds.bandwidth.good) bandwidthScore = 3;
    else if (bandwidth >= thresholds.bandwidth.fair) bandwidthScore = 2;
    else if (bandwidth >= thresholds.bandwidth.poor) bandwidthScore = 1;
    else bandwidthScore = 0;
    
    // Packet loss scoring (inverted - lower is better)
    if (packetLoss <= thresholds.packetLoss.excellent) packetLossScore = 4;
    else if (packetLoss <= thresholds.packetLoss.good) packetLossScore = 3;
    else if (packetLoss <= thresholds.packetLoss.fair) packetLossScore = 2;
    else if (packetLoss <= thresholds.packetLoss.poor) packetLossScore = 1;
    else packetLossScore = 0;
    
    // Latency scoring (inverted - lower is better)
    if (latency <= thresholds.latency.excellent) latencyScore = 4;
    else if (latency <= thresholds.latency.good) latencyScore = 3;
    else if (latency <= thresholds.latency.fair) latencyScore = 2;
    else if (latency <= thresholds.latency.poor) latencyScore = 1;
    else latencyScore = 0;
    
    // Overall score (weighted average)
    const overallScore = (bandwidthScore * 0.5 + packetLossScore * 0.3 + latencyScore * 0.2);
    
    if (overallScore >= 3.5) return 'excellent';
    else if (overallScore >= 2.5) return 'good';
    else if (overallScore >= 1.5) return 'fair';
    else if (overallScore >= 0.5) return 'poor';
    else return 'critical';
  }

  adaptAllClients() {
    for (const [peerId, clientState] of this.clientStates) {
      try {
        this.adaptClientQuality(peerId, clientState);
      } catch (error) {
        console.error(`❌ ADAPTIVE: Error adapting client ${peerId}:`, error);
      }
    }
  }

  adaptClientQuality(peerId, clientState) {
    const now = Date.now();
    
    // Check cooldown period
    if (now - clientState.lastAdaptation < clientState.adaptationCooldown) {
      return;
    }
    
    const networkCondition = this.assessNetworkCondition(clientState.networkStats);
    const newQuality = this.selectOptimalQuality(clientState, networkCondition);
    
    if (newQuality !== clientState.currentQuality) {
      this.applyQualityChange(peerId, clientState, newQuality, networkCondition);
    }
  }

  selectOptimalQuality(clientState, networkCondition) {
    const currentQuality = clientState.currentQuality;
    const qualityLevels = Object.keys(this.qualityProfiles);
    const currentIndex = qualityLevels.indexOf(currentQuality);
    
    let targetIndex = currentIndex;
    
    // Determine target quality based on network condition
    switch (networkCondition) {
      case 'excellent':
        // Can upgrade to higher quality
        if (currentIndex < qualityLevels.length - 1) {
          targetIndex = Math.min(currentIndex + 1, qualityLevels.length - 1);
        }
        break;
        
      case 'good':
        // Maintain current or slight upgrade
        if (currentIndex < qualityLevels.length - 2) {
          targetIndex = currentIndex + 1;
        }
        break;
        
      case 'fair':
        // Maintain current quality
        break;
        
      case 'poor':
        // Downgrade quality
        if (currentIndex > 0) {
          targetIndex = currentIndex - 1;
        }
        break;
        
      case 'critical':
        // Aggressive downgrade
        if (currentIndex > 1) {
          targetIndex = Math.max(currentIndex - 2, 0);
        } else if (currentIndex > 0) {
          targetIndex = 0;
        }
        break;
    }
    
    // Consider device capabilities
    const deviceOptimalQuality = this.getDeviceOptimalQuality(clientState.capabilities);
    const deviceOptimalIndex = qualityLevels.indexOf(deviceOptimalQuality);
    
    // Don't exceed device capabilities
    targetIndex = Math.min(targetIndex, deviceOptimalIndex);
    
    return qualityLevels[targetIndex];
  }

  getDeviceOptimalQuality(capabilities) {
    const deviceType = this.detectDeviceType(capabilities);
    
    switch (deviceType) {
      case 'desktop-hd':
        return 'ultra';
      case 'desktop':
        return 'high';
      case 'tablet':
        return 'medium';
      case 'mobile':
        return 'low';
      default:
        return 'medium';
    }
  }

  async applyQualityChange(peerId, clientState, newQuality, networkCondition) {
    const oldQuality = clientState.currentQuality;
    
    try {
      // Get peer and producers
      const peer = this.sfuServer.peers.get(peerId);
      if (!peer) return;
      
      // Apply quality change to producers (for streamers)
      for (const producer of peer.producers.values()) {
        if (producer.kind === 'video') {
          await this.updateProducerQuality(producer, newQuality);
        }
      }
      
      // Update client state
      clientState.currentQuality = newQuality;
      clientState.lastAdaptation = Date.now();
      
      // Track adaptation history
      clientState.adaptationHistory.push({
        timestamp: Date.now(),
        fromQuality: oldQuality,
        toQuality: newQuality,
        reason: networkCondition,
        networkStats: { ...clientState.networkStats }
      });
      
      // Keep only last 20 adaptations
      if (clientState.adaptationHistory.length > 20) {
        clientState.adaptationHistory.shift();
      }
      
      // Update counters
      if (this.getQualityLevel(newQuality) > this.getQualityLevel(oldQuality)) {
        clientState.improvementCount++;
        clientState.degradationCount = 0; // Reset degradation streak
      } else if (this.getQualityLevel(newQuality) < this.getQualityLevel(oldQuality)) {
        clientState.degradationCount++;
        clientState.improvementCount = 0; // Reset improvement streak
      }
      
      // Adjust cooldown based on adaptation pattern
      if (clientState.degradationCount > 3) {
        // Increase cooldown if frequently degrading
        clientState.adaptationCooldown = Math.min(30000, clientState.adaptationCooldown * 1.2);
      } else if (clientState.improvementCount > 2) {
        // Decrease cooldown if conditions are improving
        clientState.adaptationCooldown = Math.max(10000, clientState.adaptationCooldown * 0.8);
      }
      
      console.log(`🔄 ADAPTIVE: Client ${peerId} quality changed: ${oldQuality} → ${newQuality} (${networkCondition})`);
      
      // Notify client about quality change
      this.notifyClientQualityChange(peerId, newQuality, oldQuality);
      
      // Update metrics
      this.sfuServer.metrics?.incrementCounter('adaptive_quality_changes_total', {
        fromQuality: oldQuality,
        toQuality: newQuality,
        reason: networkCondition
      });
      
    } catch (error) {
      console.error(`❌ ADAPTIVE: Failed to apply quality change for client ${peerId}:`, error);
    }
  }

  async updateProducerQuality(producer, quality) {
    const profile = this.qualityProfiles[quality];
    
    try {
      // Update encoding parameters
      const params = {
        maxBitrate: profile.maxBitrate,
        minBitrate: profile.minBitrate,
        scaleResolutionDownBy: profile.scaleResolutionDownBy
      };
      
      // This would require extending mediasoup to support dynamic parameter updates
      // For now, we'll log the intended change
      console.log(`📹 ADAPTIVE: Would update producer ${producer.id} to ${quality} quality:`, params);
      
    } catch (error) {
      console.error(`❌ ADAPTIVE: Error updating producer quality:`, error);
    }
  }

  getQualityLevel(quality) {
    const levels = { minimal: 0, low: 1, medium: 2, high: 3, ultra: 4 };
    return levels[quality] || 2;
  }

  notifyClientQualityChange(peerId, newQuality, oldQuality) {
    const peer = this.sfuServer.peers.get(peerId);
    if (!peer) return;
    
    // Find socket for this peer
    const socket = this.sfuServer.io.sockets.sockets.get(peer.socketId);
    if (socket) {
      socket.emit('quality-changed', {
        newQuality,
        oldQuality,
        profile: this.qualityProfiles[newQuality],
        timestamp: Date.now()
      });
    }
  }

  logClientStats(peerId, clientState) {
    const { networkStats, performanceStats, currentQuality } = clientState;
    const condition = this.assessNetworkCondition(networkStats);
    
    console.log(`📊 ADAPTIVE: Client ${peerId} - Quality: ${currentQuality}, Condition: ${condition}, ` +
                `BW: ${Math.round(networkStats.bandwidth/1000)}kbps, ` +
                `Loss: ${(networkStats.packetLoss*100).toFixed(1)}%, ` +
                `Latency: ${Math.round(networkStats.latency)}ms`);
  }

  // API methods for external control
  getClientState(peerId) {
    return this.clientStates.get(peerId);
  }

  getAllClientStates() {
    return Array.from(this.clientStates.entries()).map(([peerId, state]) => ({
      peerId,
      currentQuality: state.currentQuality,
      networkCondition: this.assessNetworkCondition(state.networkStats),
      lastAdaptation: state.lastAdaptation,
      adaptationCount: state.adaptationHistory.length
    }));
  }

  forceQualityChange(peerId, quality) {
    const clientState = this.clientStates.get(peerId);
    if (!clientState) {
      throw new Error('Client not found');
    }
    
    if (!this.qualityProfiles[quality]) {
      throw new Error('Invalid quality level');
    }
    
    this.applyQualityChange(peerId, clientState, quality, 'manual');
  }

  getQualityProfiles() {
    return this.qualityProfiles;
  }

  updateQualityProfile(quality, profile) {
    this.qualityProfiles[quality] = { ...this.qualityProfiles[quality], ...profile };
  }
}

module.exports = AdaptiveBitrateManager;