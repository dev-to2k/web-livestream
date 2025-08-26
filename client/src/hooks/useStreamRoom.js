import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../contexts/ToastContext";

const useStreamRoom = (socket, roomId, username, isStreamer) => {
  const navigate = useNavigate();
  const { showSuccess, showError, showWarning, showInfo } = useToast();

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
      if (isStreamer) {
        showInfo(`${joinedUser} đã tham gia phòng`, {
          title: "Người xem mới",
          duration: 2000,
        });
      }
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
          showInfo(`Tự động chấp nhận ${requestUsername} vào phòng`, {
            title: "Tự động chấp nhận",
            duration: 2000,
          });
        } else {
          setPendingUsers((prev) => {
            const existing = prev.find((user) => user.userId === userId);
            if (!existing) {
              const newList = [...prev, { userId, username: requestUsername }];
              if (prev.length === 0) {
                setShowAcceptModal(true);
                playNotificationSound();
                showWarning(`${requestUsername} muốn tham gia phòng`, {
                  title: "Yêu cầu tham gia",
                  duration: 5000,
                });
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
      showSuccess("Bạn đã được chấp nhận vào phòng!", {
        title: "Tham gia phòng",
        duration: 3000,
      });
    });

    socket.on("join-rejected", () => {
      setIsWaitingApproval(false);
      addSystemMessage("Bạn đã bị từ chối vào phòng");
      showError("Bạn đã bị từ chối vào phòng. Đang chuyển về trang chủ...", {
        title: "Từ chối tham gia",
        duration: 2000,
      });
      setTimeout(() => navigate("/"), 2000);
    });

    // Chat messages
    socket.on("chat-message", (message) => {
      setMessages((prev) => [...prev, message]);
    });

    // Stream events
    socket.on("stream-ended", () => {
      addSystemMessage("Stream đã kết thúc");
      showWarning("Stream đã kết thúc", {
        title: "Streaming",
        duration: 3000,
      });
    });

    // Error handling for socket events
    socket.on("error", (error) => {
      console.error("🔴 CLIENT: Socket error:", error);
      showError(`Lỗi: ${error.message || "Lỗi không xác định"}`, {
        title: "Lỗi phòng",
        duration: 5000,
      });
    });

    socket.on("room-not-found", () => {
      showError("Không tìm thấy phòng. Đang chuyển về trang chủ...", {
        title: "Phòng không tồn tại",
        duration: 3000,
      });
      setTimeout(() => navigate("/"), 3000);
    });

    socket.on("room-full", () => {
      showError("Phòng đã đầy. Không thể tham gia.", {
        title: "Phòng đầy",
        duration: 5000,
      });
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
      socket.off("error");
      socket.off("room-not-found");
      socket.off("room-full");
    };
  }, [
    socket,
    roomId,
    username,
    isStreamer,
    autoAccept,
    // Remove navigate, addSystemMessage, playNotificationSound from dependencies
    // to prevent frequent re-runs. These functions are stable and don't need
    // to be dependencies.
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
        const user = pendingUsers.find((u) => u.userId === userId);
        socket.emit("accept-user", { userId, roomId });
        setPendingUsers((prev) =>
          prev.filter((user) => user.userId !== userId)
        );

        if (pendingUsers.length <= 1) {
          setShowAcceptModal(false);
        }

        if (user) {
          showSuccess(`Đã chấp nhận ${user.username} vào phòng`, {
            title: "Chấp nhận thành viên",
            duration: 2000,
          });
        }
      }
    },
    [socket, roomId, pendingUsers, showSuccess]
  );

  const rejectUser = useCallback(
    (userId) => {
      if (socket) {
        const user = pendingUsers.find((u) => u.userId === userId);
        socket.emit("reject-user", { userId, roomId });
        setPendingUsers((prev) =>
          prev.filter((user) => user.userId !== userId)
        );

        if (pendingUsers.length <= 1) {
          setShowAcceptModal(false);
        }

        if (user) {
          showWarning(`Đã từ chối ${user.username}`, {
            title: "Từ chối thành viên",
            duration: 2000,
          });
        }
      }
    },
    [socket, roomId, pendingUsers, showWarning]
  );

  const acceptAllUsers = useCallback(() => {
    if (socket) {
      const userCount = pendingUsers.length;
      pendingUsers.forEach((user) => {
        socket.emit("accept-user", { userId: user.userId, roomId });
      });
      setPendingUsers([]);
      setShowAcceptModal(false);

      if (userCount > 0) {
        showSuccess(`Đã chấp nhận tất cả ${userCount} người dùng vào phòng`, {
          title: "Chấp nhận tất cả",
          duration: 3000,
        });
      }
    }
  }, [socket, roomId, pendingUsers, showSuccess]);

  const rejectAllUsers = useCallback(() => {
    if (socket) {
      const userCount = pendingUsers.length;
      pendingUsers.forEach((user) => {
        socket.emit("reject-user", { userId: user.userId, roomId });
      });
      setPendingUsers([]);
      setShowAcceptModal(false);

      if (userCount > 0) {
        showWarning(`Đã từ chối tất cả ${userCount} người dùng`, {
          title: "Từ chối tất cả",
          duration: 3000,
        });
      }
    }
  }, [socket, roomId, pendingUsers, showWarning]);

  return useMemo(
    () => ({
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
    }),
    [
      viewerCount,
      messages,
      autoAccept,
      pendingUsers,
      showAcceptModal,
      isWaitingApproval,
      sendMessage,
      toggleAutoAccept,
      acceptUser,
      rejectUser,
      acceptAllUsers,
      rejectAllUsers,
      setShowAcceptModal,
      addSystemMessage,
    ]
  );
};

export default useStreamRoom;
