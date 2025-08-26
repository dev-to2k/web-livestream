import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { useToast } from "../contexts/ToastContext";

const useSocket = (serverUrl = "http://localhost:5000") => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const socketRef = useRef(null);
  const reconnectToastRef = useRef(null);
  const { showSocketError, showSuccess, showNetworkError, removeToast } =
    useToast();

  useEffect(() => {
    // Create socket connection
    const newSocket = io(serverUrl, {
      // Enhanced connection options
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 10000,
    });
    socketRef.current = newSocket;
    setSocket(newSocket);

    // Connection event handlers
    newSocket.on("connect", () => {
      console.log("🔵 SOCKET: Connected to server");
      setIsConnected(true);
      setConnectionError(null);

      // Remove reconnection toast if it exists
      if (reconnectToastRef.current) {
        removeToast(reconnectToastRef.current);
        reconnectToastRef.current = null;
      }

      // Show success toast on reconnection
      if (connectionError) {
        showSuccess("Đã kết nối lại thành công!", {
          title: "Kết nối khôi phục",
          duration: 3000,
        });
      }
    });

    newSocket.on("disconnect", (reason) => {
      console.log("🔴 SOCKET: Disconnected from server. Reason:", reason);
      setIsConnected(false);

      // Only show disconnection toast for unexpected disconnects
      if (reason !== "io client disconnect") {
        reconnectToastRef.current = showSocketError(
          "Mất kết nối với server. Đang thử kết nối lại...",
          {
            title: "Mất kết nối",
            duration: 0, // Don't auto-dismiss
          }
        );
      }
    });

    newSocket.on("connect_error", (error) => {
      console.error("🔴 SOCKET: Connection error:", error);
      setIsConnected(false);
      setConnectionError(error);

      // Enhanced error handling with specific diagnostics
      if (
        error.type === "TransportError" ||
        error.message.includes("xhr poll error")
      ) {
        showNetworkError(error, {
          title: "Lỗi kết nối mạng",
          message:
            "Không thể kết nối đến server trên cổng 5000. Vui lòng kiểm tra:\n\u2022 Server đã chạy chưa (npm run server)\n\u2022 Cổng 5000 có bị chiếm không\n\u2022 Kết nối mạng có ổn định không",
          onRetry: () => {
            console.log("🔄 Attempting to reconnect...");
            newSocket.connect();
          },
        });
      } else if (
        error.code === "ECONNREFUSED" ||
        error.message.includes("ERR_CONNECTION_REFUSED") ||
        error.message.includes("Connection refused")
      ) {
        showNetworkError(error, {
          title: "Server không hoạt động",
          message:
            "Server trên localhost:5000 không phản hồi:\n\u2022 Chạy lệnh: npm run server\n\u2022 Kiểm tra cổng 5000 có trống không\n\u2022 Khởi động lại ứng dụng",
          onRetry: () => {
            window.location.reload();
          },
        });
      } else {
        showSocketError(`Không thể kết nối đến server: ${error.message}`, {
          title: "Lỗi kết nối",
          duration: 8000,
        });
      }
    });

    newSocket.on("reconnect", (attemptNumber) => {
      console.log(`🟢 SOCKET: Reconnected after ${attemptNumber} attempts`);
      if (reconnectToastRef.current) {
        removeToast(reconnectToastRef.current);
        reconnectToastRef.current = null;
      }
    });

    newSocket.on("reconnect_attempt", (attemptNumber) => {
      console.log(`🟡 SOCKET: Reconnection attempt ${attemptNumber}`);
    });

    newSocket.on("reconnect_failed", () => {
      console.error("🔴 SOCKET: Reconnection failed after maximum attempts");
      if (reconnectToastRef.current) {
        removeToast(reconnectToastRef.current);
        reconnectToastRef.current = null;
      }

      showNetworkError(
        "Không thể kết nối lại đến server. Vui lòng kiểm tra kết nối mạng và thử lại.",
        {
          title: "Kết nối thất bại",
          onRetry: () => {
            window.location.reload();
          },
        }
      );
    });

    // Cleanup on unmount
    return () => {
      console.log("🔴 SOCKET: Cleaning up socket connection");
      newSocket.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [serverUrl]);

  return {
    socket,
    isConnected,
    connectionError,
    disconnect: () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    },
    reconnect: () => {
      if (socketRef.current) {
        socketRef.current.connect();
      }
    },
  };
};

export default useSocket;
