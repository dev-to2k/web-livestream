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

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join room
  socket.on("join-room", ({ roomId, username, isStreamer }) => {
    console.log("🟢 SERVER: User trying to join room", {
      socketId: socket.id,
      roomId,
      username,
      isStreamer,
    });
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        streamer: null,
        viewers: new Set(),
        messages: [],
        autoAccept: true,
      });
    }

    const room = rooms.get(roomId);

    if (isStreamer && !room.streamer) {
      // User is the streamer
      room.streamer = { id: socket.id, username };
      // Keep default autoAccept: true for new rooms
      socket.join(roomId);
      socket.emit("streamer-status", { isStreamer: true });

      users.set(socket.id, { username, roomId, isStreamer: true });

      // Send room info to streamer
      socket.emit("room-info", {
        roomId,
        viewerCount: room.viewers.size,
        messages: room.messages.slice(-50),
      });
    } else if (!isStreamer) {
      // User wants to join as viewer
      console.log(
        `User ${username} trying to join room ${roomId}. Room autoAccept: ${
          room.autoAccept
        }, Has streamer: ${!!room.streamer}`
      );

      if (room.autoAccept || !room.streamer) {
        // Auto accept or no streamer to ask
        console.log(`Auto accepting user ${username}`);
        socket.join(roomId);
        room.viewers.add(socket.id); // Store only socketId for easy removal
        socket.emit("streamer-status", { isStreamer: false });

        users.set(socket.id, { username, roomId, isStreamer: false });

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
      } else {
        // Need streamer approval
        console.log(`🟡 SERVER: User ${username} needs approval from streamer`);
        if (room.streamer) {
          console.log(
            `🟡 SERVER: Sending waiting-approval to user ${socket.id}`
          );
          socket.emit("waiting-approval"); // Tell user they need to wait
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
        }
      }
    } else {
      // Another user trying to be streamer
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

  // Handle WebRTC signaling
  socket.on("offer", ({ offer, roomId }) => {
    socket.to(roomId).emit("offer", { offer, streamerId: socket.id });
  });

  socket.on("answer", ({ answer, streamerId }) => {
    socket.to(streamerId).emit("answer", { answer, viewerId: socket.id });
  });

  socket.on("ice-candidate", ({ candidate, roomId, targetId }) => {
    if (targetId) {
      socket
        .to(targetId)
        .emit("ice-candidate", { candidate, senderId: socket.id });
    } else {
      socket
        .to(roomId)
        .emit("ice-candidate", { candidate, senderId: socket.id });
    }
  });

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

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("🔴 SERVER: User disconnecting:", socket.id);
    const user = users.get(socket.id);
    if (user) {
      console.log("🔴 SERVER: Found user data:", user);
      const room = rooms.get(user.roomId);
      if (room) {
        console.log(
          "🔴 SERVER: Found room, viewers before:",
          room.viewers.size
        );

        if (room.streamer && room.streamer.id === socket.id) {
          // Streamer is leaving
          console.log("🔴 SERVER: Streamer leaving room");
          room.streamer = null;
          socket.to(user.roomId).emit("stream-ended");
        } else if (!user.pending) {
          // Regular viewer is leaving (not pending)
          console.log("🔴 SERVER: Viewer leaving room");
          room.viewers.delete(socket.id);
          console.log("🔴 SERVER: Viewers after removal:", room.viewers.size);
        }

        // Notify others about user leaving with updated count
        socket.to(user.roomId).emit("user-left", {
          username: user.username,
          viewerCount: room.viewers.size,
        });

        console.log(
          "🔴 SERVER: Sent user-left event with count:",
          room.viewers.size
        );
      }
      users.delete(socket.id);
    }
    console.log("🔴 SERVER: User disconnected:", socket.id);
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
