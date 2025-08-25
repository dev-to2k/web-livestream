const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client/build")));

// In-memory storage (replace with database in production)
const rooms = new Map();
const users = new Map();
const connectionStates = new Map(); // socketId -> connectionInfo

// Helper functions for connection management
const updateConnectionState = (socketId, state) => {
  const current = connectionStates.get(socketId) || {};
  const updated = {
    ...current,
    ...state,
    lastUpdate: Date.now()
  };
  connectionStates.set(socketId, updated);
  console.log(`🔵 SERVER: Updated connection state for ${socketId}:`, updated);
  return updated;
};

const getConnectionState = (socketId) => {
  return connectionStates.get(socketId) || {};
};

const cleanupConnectionState = (socketId) => {
  connectionStates.delete(socketId);
  console.log(`🔵 SERVER: Cleaned up connection state for ${socketId}`);
};

// Enhanced room creation with better state management
const createEnhancedRoom = (roomId, streamerId, username) => {
  const room = {
    id: roomId,
    streamer: { 
      id: streamerId, 
      username,
      connectionState: 'active',
      startTime: Date.now()
    },
    viewers: new Set(),
    messages: [],
    autoAccept: true,
    connectionHealth: {
      lastPing: Date.now(),
      consecutiveFailures: 0,
      status: 'healthy'
    },
    streamStats: {
      totalViewers: 0,
      currentViewers: 0,
      peakViewers: 0,
      startTime: Date.now()
    }
  };
  
  rooms.set(roomId, room);
  console.log(`🔵 SERVER: Created enhanced room ${roomId} with streamer ${username}`);
  return room;
};

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Enhanced join room logic
  socket.on("join-room", ({ roomId, username, isStreamer }) => {
    console.log("🟢 SERVER: User trying to join room", {
      socketId: socket.id,
      roomId,
      username,
      isStreamer,
    });
    
    if (!rooms.has(roomId)) {
      console.log(`🟢 SERVER: Creating new room ${roomId}`);
      if (isStreamer) {
        createEnhancedRoom(roomId, socket.id, username);
      } else {
        rooms.set(roomId, {
          id: roomId,
          streamer: null,
          viewers: new Set(),
          messages: [],
          autoAccept: true,
        });
      }
    }

    const room = rooms.get(roomId);

    if (isStreamer && !room.streamer) {
      // User is the streamer
      room.streamer = { id: socket.id, username };
      socket.join(roomId);
      socket.emit("streamer-status", { isStreamer: true });

      users.set(socket.id, { username, roomId, isStreamer: true });
      updateConnectionState(socket.id, {
        role: 'streamer',
        roomId,
        username,
        status: 'joined'
      });

      // Send room info to streamer
      socket.emit("room-info", {
        roomId,
        viewerCount: room.viewers.size,
        messages: room.messages.slice(-50),
      });
      
      console.log(`🟢 SERVER: ${username} joined as streamer in room ${roomId}`);
    } else if (!isStreamer) {
      // User wants to join as viewer
      console.log(
        `🟢 SERVER: User ${username} trying to join room ${roomId}. Room autoAccept: ${
          room.autoAccept
        }, Has streamer: ${!!room.streamer}`
      );

      if (room.autoAccept || !room.streamer) {
        // Auto accept or no streamer to ask
        console.log(`🟢 SERVER: Auto accepting user ${username}`);
        socket.join(roomId);
        room.viewers.add(socket.id);
        socket.emit("streamer-status", { isStreamer: false });

        users.set(socket.id, { username, roomId, isStreamer: false });
        updateConnectionState(socket.id, {
          role: 'viewer',
          roomId,
          username,
          status: 'joined'
        });

        // Update viewer statistics
        if (room.streamStats) {
          room.streamStats.currentViewers = room.viewers.size;
          room.streamStats.totalViewers++;
          room.streamStats.peakViewers = Math.max(
            room.streamStats.peakViewers, 
            room.viewers.size
          );
        }

        // Send room info to viewer
        socket.emit("room-info", {
          roomId,
          viewerCount: room.viewers.size,
          messages: room.messages.slice(-50),
        });

        // Notify others in room
        socket
          .to(roomId)
          .emit("user-joined", { username, viewerCount: room.viewers.size });
          
        console.log(`🟢 SERVER: ${username} joined as viewer in room ${roomId}`);
      } else {
        // Need streamer approval
        console.log(`🟡 SERVER: User ${username} needs approval from streamer`);
        if (room.streamer) {
          console.log(
            `🟡 SERVER: Sending waiting-approval to user ${socket.id}`
          );
          socket.emit("waiting-approval");
          console.log(
            `🟡 SERVER: Sending join-request to streamer ${room.streamer.id}`
          );
          socket.to(room.streamer.id).emit("join-request", {
            userId: socket.id,
            username,
          });
          users.set(socket.id, {
            username,
            roomId,
            isStreamer: false,
            pending: true,
          });
          updateConnectionState(socket.id, {
            role: 'viewer',
            roomId,
            username,
            status: 'pending_approval'
          });
        }
      }
    } else {
      // Another user trying to be streamer
      console.log(`🔴 SERVER: Rejected streamer attempt from ${username} - room already has streamer`);
      socket.emit("streamer-status", {
        isStreamer: false,
        error: "Room already has a streamer",
      });
    }
  });

  // Handle accept/reject user
  socket.on("accept-user", ({ userId, roomId }) => {
    const room = rooms.get(roomId);
    const user = users.get(socket.id);

    if (room && user && user.isStreamer && room.streamer.id === socket.id) {
      const pendingUser = users.get(userId);
      if (pendingUser && pendingUser.pending) {
        // Accept the user
        const targetSocket = io.sockets.sockets.get(userId);
        if (targetSocket) {
          targetSocket.join(roomId);
          room.viewers.add(userId); // Store only socketId for easy removal
          pendingUser.pending = false;

          targetSocket.emit("join-accepted");
          targetSocket.emit("streamer-status", { isStreamer: false });
          targetSocket.emit("room-info", {
            roomId,
            viewerCount: room.viewers.size,
            messages: room.messages.slice(-50),
          });

          // Notify others in room
          socket.to(roomId).emit("user-joined", {
            username: pendingUser.username,
            viewerCount: room.viewers.size,
          });
        }
      }
    }
  });

  socket.on("reject-user", ({ userId, roomId }) => {
    const room = rooms.get(roomId);
    const user = users.get(socket.id);

    if (room && user && user.isStreamer && room.streamer.id === socket.id) {
      const pendingUser = users.get(userId);
      if (pendingUser && pendingUser.pending) {
        const targetSocket = io.sockets.sockets.get(userId);
        if (targetSocket) {
          targetSocket.emit("join-rejected");
        }
        users.delete(userId);
      }
    }
  });

  // Update auto accept setting
  socket.on("update-auto-accept", ({ roomId, autoAccept }) => {
    console.log("🟢 SERVER: Received update-auto-accept", {
      roomId,
      autoAccept,
    });
    const room = rooms.get(roomId);
    const user = users.get(socket.id);

    if (room && user && user.isStreamer && room.streamer.id === socket.id) {
      console.log("🟢 SERVER: Updated room autoAccept", {
        from: room.autoAccept,
        to: autoAccept,
      });
      room.autoAccept = autoAccept;
    } else {
      console.log(
        "🔴 SERVER: Failed to update autoAccept - invalid permissions"
      );
    }
  });

  // Enhanced WebRTC signaling with better error handling
  socket.on("offer", ({ offer, roomId, timestamp }) => {
    console.log("🔵 SERVER: Received offer from", socket.id, "for room", roomId);
    
    const user = users.get(socket.id);
    if (!user || !user.isStreamer) {
      console.log("🔴 SERVER: Rejected offer from non-streamer", socket.id);
      return;
    }
    
    updateConnectionState(socket.id, {
      role: 'streamer',
      roomId,
      offerSent: true,
      status: 'offering',
      lastOfferTime: timestamp || Date.now()
    });
    
    const room = rooms.get(roomId);
    if (room) {
      console.log(`🔵 SERVER: Broadcasting offer to ${room.viewers.size} viewers in room ${roomId}`);
      socket.to(roomId).emit("offer", { 
        offer, 
        streamerId: socket.id,
        timestamp: timestamp || Date.now()
      });
    } else {
      console.log("🔴 SERVER: Room not found for offer", roomId);
    }
  });

  socket.on("answer", ({ answer, streamerId, timestamp }) => {
    console.log("🔵 SERVER: Received answer from", socket.id, "to streamer", streamerId);
    
    const user = users.get(socket.id);
    if (!user || user.isStreamer) {
      console.log("🔴 SERVER: Rejected answer from streamer", socket.id);
      return;
    }
    
    updateConnectionState(socket.id, {
      role: 'viewer',
      streamerId,
      answerSent: true,
      status: 'answering',
      lastAnswerTime: timestamp || Date.now()
    });
    
    // Update streamer's connection state
    const streamerState = getConnectionState(streamerId);
    updateConnectionState(streamerId, {
      ...streamerState,
      status: 'connected',
      connectedViewers: (streamerState.connectedViewers || 0) + 1,
      lastConnectionTime: Date.now()
    });
    
    console.log(`🔵 SERVER: Forwarding answer from ${socket.id} to streamer ${streamerId}`);
    socket.to(streamerId).emit("answer", { 
      answer, 
      viewerId: socket.id,
      timestamp: timestamp || Date.now()
    });
  });

  socket.on("ice-candidate", ({ candidate, roomId, targetId, timestamp }) => {
    console.log("🔵 SERVER: Received ICE candidate from", socket.id);
    
    if (targetId) {
      // Specific target (viewer to streamer or streamer to specific viewer)
      console.log(`🔵 SERVER: Forwarding ICE candidate from ${socket.id} to ${targetId}`);
      socket.to(targetId).emit("ice-candidate", { 
        candidate, 
        senderId: socket.id,
        timestamp: timestamp || Date.now()
      });
    } else if (roomId) {
      // Broadcast to room (streamer to all viewers)
      console.log(`🔵 SERVER: Broadcasting ICE candidate from ${socket.id} to room ${roomId}`);
      socket.to(roomId).emit("ice-candidate", { 
        candidate, 
        senderId: socket.id,
        timestamp: timestamp || Date.now()
      });
    } else {
      console.log("🔴 SERVER: ICE candidate missing targetId and roomId", socket.id);
    }
    
    // Update connection state to track ICE candidate exchange
    const currentState = getConnectionState(socket.id);
    updateConnectionState(socket.id, {
      ...currentState,
      lastIceCandidateTime: timestamp || Date.now(),
      iceCandidatesSent: (currentState.iceCandidatesSent || 0) + 1
    });
  });
  
  // Connection health monitoring
  socket.on("connection-health", ({ status, streamerId, details }) => {
    console.log("🔵 SERVER: Connection health update from", socket.id, ":", status);
    
    updateConnectionState(socket.id, {
      connectionHealth: status,
      healthDetails: details,
      lastHealthUpdate: Date.now()
    });
    
    if (status === 'failed' || status === 'disconnected') {
      handleConnectionFailure(socket.id, streamerId);
    }
  });
  
  // Handle connection failures
  const handleConnectionFailure = (viewerId, streamerId) => {
    console.log(`🔴 SERVER: Handling connection failure for viewer ${viewerId} and streamer ${streamerId}`);
    
    // Notify both parties
    if (viewerId) {
      socket.to(viewerId).emit("connection-failed", { streamerId });
    }
    if (streamerId) {
      socket.to(streamerId).emit("viewer-disconnected", { viewerId });
      
      // Update streamer's connection state
      const streamerState = getConnectionState(streamerId);
      if (streamerState) {
        updateConnectionState(streamerId, {
          ...streamerState,
          connectedViewers: Math.max(0, (streamerState.connectedViewers || 1) - 1),
          lastDisconnectionTime: Date.now()
        });
      }
    }
    
    // Update viewer's connection state
    updateConnectionState(viewerId, { 
      status: 'failed',
      lastFailureTime: Date.now()
    });
  };

  // Chat messages
  socket.on("chat-message", ({ message, roomId }) => {
    const user = users.get(socket.id);
    if (user && rooms.has(roomId)) {
      const chatMessage = {
        id: Date.now(),
        username: user.username,
        message,
        timestamp: new Date().toISOString(),
        isStreamer: user.isStreamer || false,
      };

      rooms.get(roomId).messages.push(chatMessage);
      io.to(roomId).emit("chat-message", chatMessage);
    }
  });

  // Enhanced disconnect handling
  socket.on("disconnect", () => {
    console.log("🔴 SERVER: User disconnecting:", socket.id);
    const user = users.get(socket.id);
    const connectionState = getConnectionState(socket.id);
    
    if (user) {
      console.log("🔴 SERVER: Found user data:", user);
      console.log("🔴 SERVER: Connection state:", connectionState);
      
      const room = rooms.get(user.roomId);
      if (room) {
        console.log(
          "🔴 SERVER: Found room, viewers before:",
          room.viewers.size
        );

        if (room.streamer && room.streamer.id === socket.id) {
          // Streamer is leaving
          console.log("🔴 SERVER: Streamer leaving room", user.roomId);
          room.streamer = null;
          
          // Update room stats
          if (room.streamStats) {
            room.streamStats.endTime = Date.now();
            room.streamStats.duration = room.streamStats.endTime - room.streamStats.startTime;
          }
          
          // Notify all viewers that stream ended
          socket.to(user.roomId).emit("stream-ended", {
            reason: "streamer_disconnected",
            message: "Streamer đã ngắt kết nối",
            reconnectPossible: true
          });
          
          // Clean up viewer connections for this room
          room.viewers.forEach(viewerId => {
            updateConnectionState(viewerId, {
              status: 'streamer_disconnected',
              disconnectedAt: Date.now()
            });
          });
          
        } else if (!user.pending) {
          // Regular viewer is leaving (not pending)
          console.log("🔴 SERVER: Viewer leaving room", user.roomId);
          room.viewers.delete(socket.id);
          
          // Update room stats
          if (room.streamStats) {
            room.streamStats.currentViewers = room.viewers.size;
          }
          
          console.log("🔴 SERVER: Viewers after removal:", room.viewers.size);
          
          // If this was a connected viewer, update streamer's connection count
          if (connectionState.status === 'connected' && room.streamer) {
            const streamerState = getConnectionState(room.streamer.id);
            if (streamerState) {
              updateConnectionState(room.streamer.id, {
                ...streamerState,
                connectedViewers: Math.max(0, (streamerState.connectedViewers || 1) - 1)
              });
            }
          }
        } else {
          // Pending user leaving
          console.log("🔴 SERVER: Pending user leaving", socket.id);
        }

        // Notify others about user leaving with updated count (only for joined users)
        if (!user.pending) {
          socket.to(user.roomId).emit("user-left", {
            username: user.username,
            viewerCount: room.viewers.size,
            isStreamer: user.isStreamer
          });

          console.log(
            "🔴 SERVER: Sent user-left event with count:",
            room.viewers.size
          );
        }
        
        // Clean up empty rooms (optional - keeps rooms persistent)
        if (!room.streamer && room.viewers.size === 0 && room.messages.length === 0) {
          console.log(`🔴 SERVER: Cleaning up empty room ${user.roomId}`);
          rooms.delete(user.roomId);
        }
      } else {
        console.log("🔴 SERVER: Room not found for user", user.roomId);
      }
      
      // Clean up user data
      users.delete(socket.id);
    } else {
      console.log("🔴 SERVER: No user data found for", socket.id);
    }
    
    // Clean up connection state
    cleanupConnectionState(socket.id);
    
    console.log("🔴 SERVER: User disconnected cleanup completed:", socket.id);
  });
});

// API Routes
app.get("/api/rooms", (req, res) => {
  const roomList = Array.from(rooms.values()).map((room) => ({
    id: room.id,
    streamer: room.streamer?.username || null,
    viewerCount: room.viewers.size,
    isLive: !!room.streamer,
  }));
  res.json(roomList);
});

// Serve React app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/build/index.html"));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
