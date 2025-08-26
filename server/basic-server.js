const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// Error handling for the server
process.on("uncaughtException", (error) => {
  console.error("❌ FATAL ERROR:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ UNHANDLED REJECTION:", reason);
});

// Configure Socket.io with CORS
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

// In-memory storage for basic functionality
const rooms = new Map();
const users = new Map();

// Basic room structure
class Room {
  constructor(roomId) {
    this.roomId = roomId;
    this.streamer = null;
    this.viewers = new Set();
    this.messages = [];
    this.settings = {
      autoAccept: true,
    };
    this.createdAt = new Date();
  }
}

// Socket.io event handlers
io.on("connection", (socket) => {
  console.log(`🔌 SOCKET: User connected - ${socket.id}`);

  // Handle room joining
  socket.on("join-room", ({ roomId, username, isStreamer }) => {
    console.log(
      `🏠 ROOM: ${username} ${
        isStreamer ? "(streamer)" : "(viewer)"
      } joining room ${roomId}`
    );

    // Get or create room
    let room = rooms.get(roomId);
    if (!room) {
      room = new Room(roomId);
      rooms.set(roomId, room);
      console.log(`🏠 ROOM: Created new room ${roomId}`);
    }

    // Store user info
    const user = {
      socketId: socket.id,
      username,
      roomId,
      isStreamer,
    };
    users.set(socket.id, user);

    // Join socket room
    socket.join(roomId);

    if (isStreamer) {
      // Handle streamer join
      room.streamer = user;
      socket.emit("streamer-status", { isStreamer: true });
      console.log(`🎬 STREAMER: ${username} became streamer of room ${roomId}`);
    } else {
      // Handle viewer join
      if (room.settings.autoAccept) {
        room.viewers.add(socket.id);
        socket.emit("streamer-status", { isStreamer: false });

        // Notify room about new viewer
        socket.to(roomId).emit("user-joined", {
          username,
          viewerCount: room.viewers.size,
        });
        console.log(
          `👁️ VIEWER: ${username} joined room ${roomId} (${room.viewers.size} viewers)`
        );
      } else {
        // Send join request to streamer
        socket.emit("waiting-approval");
        if (room.streamer) {
          io.to(room.streamer.socketId).emit("join-request", {
            userId: socket.id,
            username,
          });
        }
        console.log(
          `⏳ REQUEST: ${username} waiting for approval in room ${roomId}`
        );
      }
    }

    // Send room info
    socket.emit("room-info", {
      roomId,
      viewerCount: room.viewers.size,
      messages: room.messages.slice(-50), // Last 50 messages
    });
  });

  // Handle auto-accept toggle
  socket.on("update-auto-accept", ({ roomId, autoAccept }) => {
    const room = rooms.get(roomId);
    if (room && room.streamer?.socketId === socket.id) {
      room.settings.autoAccept = autoAccept;
      console.log(
        `⚙️ SETTINGS: Auto-accept ${
          autoAccept ? "enabled" : "disabled"
        } in room ${roomId}`
      );
    }
  });

  // Handle user acceptance
  socket.on("accept-user", ({ userId, roomId }) => {
    const room = rooms.get(roomId);
    const user = users.get(userId);

    if (room && user && room.streamer?.socketId === socket.id) {
      room.viewers.add(userId);

      // Notify accepted user
      io.to(userId).emit("join-accepted");
      io.to(userId).emit("streamer-status", { isStreamer: false });

      // Notify room about new viewer
      io.to(roomId).emit("user-joined", {
        username: user.username,
        viewerCount: room.viewers.size,
      });

      console.log(`✅ ACCEPTED: ${user.username} accepted into room ${roomId}`);
    }
  });

  // Handle user rejection
  socket.on("reject-user", ({ userId, roomId }) => {
    const user = users.get(userId);
    if (user) {
      io.to(userId).emit("join-rejected");
      console.log(`❌ REJECTED: ${user.username} rejected from room ${roomId}`);
    }
  });

  // Handle chat messages
  socket.on("chat-message", ({ message, roomId }) => {
    const user = users.get(socket.id);
    const room = rooms.get(roomId);

    if (user && room && message.trim()) {
      const chatMessage = {
        id: Date.now(),
        username: user.username,
        message: message.trim(),
        timestamp: new Date().toISOString(),
        isSystem: false,
      };

      room.messages.push(chatMessage);

      // Keep only last 100 messages
      if (room.messages.length > 100) {
        room.messages = room.messages.slice(-100);
      }

      // Broadcast to room
      io.to(roomId).emit("chat-message", chatMessage);
      console.log(
        `💬 CHAT: ${user.username} in room ${roomId}: ${message.trim()}`
      );
    }
  });

  // Handle WebRTC signaling
  socket.on("offer", ({ offer, roomId }) => {
    console.log(
      `📡 WEBRTC: Received offer from ${socket.id} in room ${roomId}`
    );
    socket.to(roomId).emit("offer", { offer, streamerId: socket.id });
  });

  socket.on("answer", ({ answer, streamerId }) => {
    console.log(
      `📡 WEBRTC: Received answer from ${socket.id} to ${streamerId}`
    );
    io.to(streamerId).emit("answer", { answer });
  });

  socket.on("ice-candidate", ({ candidate, roomId, targetId }) => {
    console.log(`🧊 ICE: Candidate from ${socket.id} in room ${roomId}`);
    if (targetId) {
      io.to(targetId).emit("ice-candidate", { candidate });
    } else {
      socket.to(roomId).emit("ice-candidate", { candidate });
    }
  });

  // Handle disconnection
  socket.on("disconnect", (reason) => {
    console.log(`🔌 SOCKET: User disconnected - ${socket.id} (${reason})`);

    const user = users.get(socket.id);
    if (user) {
      const room = rooms.get(user.roomId);
      if (room) {
        if (user.isStreamer && room.streamer?.socketId === socket.id) {
          // Streamer disconnected
          room.streamer = null;
          io.to(user.roomId).emit("stream-ended");
          console.log(`🎬 STREAMER: ${user.username} left room ${user.roomId}`);
        } else {
          // Viewer disconnected
          room.viewers.delete(socket.id);
          socket.to(user.roomId).emit("user-left", {
            username: user.username,
            viewerCount: room.viewers.size,
          });
          console.log(
            `👁️ VIEWER: ${user.username} left room ${user.roomId} (${room.viewers.size} viewers)`
          );
        }

        // Clean up empty rooms
        if (!room.streamer && room.viewers.size === 0) {
          rooms.delete(user.roomId);
          console.log(`🗑️ CLEANUP: Removed empty room ${user.roomId}`);
        }
      }

      users.delete(socket.id);
    }
  });
});

// Basic API routes
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    rooms: rooms.size,
    users: users.size,
  });
});

app.get("/api/rooms", (req, res) => {
  const roomList = Array.from(rooms.values()).map((room) => ({
    roomId: room.roomId,
    hasStreamer: !!room.streamer,
    viewerCount: room.viewers.size,
    createdAt: room.createdAt,
  }));

  res.json(roomList);
});

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 SERVER: Basic Live Streaming Server running on port ${PORT}`);
  console.log(`🌐 CORS: Allowing connections from http://localhost:3000`);
  console.log(`📊 FEATURES: Basic WebRTC signaling, Chat, Room management`);
  console.log(`🔗 HEALTH: http://localhost:${PORT}/api/health`);
  console.log(`🏠 ROOMS: http://localhost:${PORT}/api/rooms`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🔄 SERVER: Shutting down gracefully...");
  server.close(() => {
    console.log("✅ SERVER: Server closed");
    process.exit(0);
  });
});

module.exports = server;
