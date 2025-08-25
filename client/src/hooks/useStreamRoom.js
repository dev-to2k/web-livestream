import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const useStreamRoom = (socket, roomId, username, isStreamer) => {
  const navigate = useNavigate();

  // Room state
  const [viewerCount, setViewerCount] = useState(0);
  const [messages, setMessages] = useState([]);
  const [autoAccept, setAutoAccept] = useState(true);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [isWaitingApproval, setIsWaitingApproval] = useState(false);

  // Add system message helper
  const addSystemMessage = useCallback((text) => {
    const systemMessage = {
      id: Date.now(),
      username: "System",
      message: text,
      timestamp: new Date().toISOString(),
      isSystem: true,
    };
    setMessages((prev) => [...prev, systemMessage]);
  }, []);

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.3
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log("Audio context not available");
    }
  }, []);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    // Join room
    console.log("🔵 CLIENT: Joining room", { roomId, username, isStreamer });
    socket.emit("join-room", { roomId, username, isStreamer });

    // Room info
    socket.on("room-info", ({ viewerCount: count, messages: roomMessages }) => {
      console.log("🔵 CLIENT: Received room-info", {
        count,
        messagesLength: roomMessages.length,
      });
      setViewerCount(count);
      setMessages(roomMessages);
    });

    // User events
    socket.on("user-joined", ({ username: joinedUser, viewerCount: count }) => {
      console.log("🔵 CLIENT: User joined", { joinedUser, newCount: count });
      setViewerCount(count);
      addSystemMessage(`${joinedUser} đã tham gia phòng`);
    });

    socket.on("user-left", ({ username: leftUser, viewerCount: count }) => {
      console.log("🔵 CLIENT: User left", { leftUser, newCount: count });
      setViewerCount(count);
      addSystemMessage(`${leftUser} đã rời phòng`);
    });

    // Join request handling (for streamers)
    socket.on("join-request", ({ userId, username: requestUsername }) => {
      if (isStreamer) {
        if (autoAccept) {
          socket.emit("accept-user", { userId, roomId });
        } else {
          setPendingUsers((prev) => {
            const existing = prev.find((user) => user.userId === userId);
            if (!existing) {
              const newList = [...prev, { userId, username: requestUsername }];
              if (prev.length === 0) {
                setShowAcceptModal(true);
                playNotificationSound();
              }
              return newList;
            }
            return prev;
          });
        }
      }
    });

    // Approval events (for viewers)
    socket.on("waiting-approval", () => {
      console.log("🟡 CLIENT: Received waiting-approval event - showing popup");
      setIsWaitingApproval(true);
    });

    socket.on("join-accepted", () => {
      setIsWaitingApproval(false);
      addSystemMessage("Bạn đã được chấp nhận vào phòng");
    });

    socket.on("join-rejected", () => {
      setIsWaitingApproval(false);
      addSystemMessage("Bạn đã bị từ chối vào phòng");
      setTimeout(() => navigate("/"), 2000);
    });

    // Chat messages
    socket.on("chat-message", (message) => {
      setMessages((prev) => [...prev, message]);
    });

    // Stream events
    socket.on("stream-ended", () => {
      addSystemMessage("Stream đã kết thúc");
    });

    return () => {
      // Cleanup listeners
      socket.off("room-info");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("join-request");
      socket.off("waiting-approval");
      socket.off("join-accepted");
      socket.off("join-rejected");
      socket.off("chat-message");
      socket.off("stream-ended");
    };
  }, [
    socket,
    roomId,
    username,
    isStreamer,
    autoAccept,
    navigate,
    addSystemMessage,
    playNotificationSound,
  ]);

  // Actions
  const sendMessage = useCallback(
    (message) => {
      if (socket && message.trim()) {
        socket.emit("chat-message", {
          message: message.trim(),
          roomId,
        });
      }
    },
    [socket, roomId]
  );

  const toggleAutoAccept = useCallback(() => {
    const newAutoAccept = !autoAccept;
    console.log("🔵 CLIENT: Toggling auto-accept", {
      from: autoAccept,
      to: newAutoAccept,
    });
    setAutoAccept(newAutoAccept);

    if (socket && isStreamer) {
      console.log("🔵 CLIENT: Sending update-auto-accept to server", {
        roomId,
        autoAccept: newAutoAccept,
      });
      socket.emit("update-auto-accept", { roomId, autoAccept: newAutoAccept });
    }
  }, [socket, isStreamer, roomId, autoAccept]);

  const acceptUser = useCallback(
    (userId) => {
      if (socket) {
        socket.emit("accept-user", { userId, roomId });
        setPendingUsers((prev) =>
          prev.filter((user) => user.userId !== userId)
        );

        if (pendingUsers.length <= 1) {
          setShowAcceptModal(false);
        }
      }
    },
    [socket, roomId, pendingUsers.length]
  );

  const rejectUser = useCallback(
    (userId) => {
      if (socket) {
        socket.emit("reject-user", { userId, roomId });
        setPendingUsers((prev) =>
          prev.filter((user) => user.userId !== userId)
        );

        if (pendingUsers.length <= 1) {
          setShowAcceptModal(false);
        }
      }
    },
    [socket, roomId, pendingUsers.length]
  );

  const acceptAllUsers = useCallback(() => {
    if (socket) {
      pendingUsers.forEach((user) => {
        socket.emit("accept-user", { userId: user.userId, roomId });
      });
      setPendingUsers([]);
      setShowAcceptModal(false);
    }
  }, [socket, roomId, pendingUsers]);

  const rejectAllUsers = useCallback(() => {
    if (socket) {
      pendingUsers.forEach((user) => {
        socket.emit("reject-user", { userId: user.userId, roomId });
      });
      setPendingUsers([]);
      setShowAcceptModal(false);
    }
  }, [socket, roomId, pendingUsers]);

  return {
    // State
    viewerCount,
    messages,
    autoAccept,
    pendingUsers,
    showAcceptModal,
    isWaitingApproval,

    // Actions
    sendMessage,
    toggleAutoAccept,
    acceptUser,
    rejectUser,
    acceptAllUsers,
    rejectAllUsers,
    setShowAcceptModal,

    // Helpers
    addSystemMessage,
  };
};

export default useStreamRoom;
