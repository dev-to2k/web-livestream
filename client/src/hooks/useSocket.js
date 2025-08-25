import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const useSocket = (serverUrl = "http://localhost:5000") => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    // Create socket connection
    const newSocket = io(serverUrl);
    socketRef.current = newSocket;
    setSocket(newSocket);

    // Connection event handlers
    newSocket.on("connect", () => {
      console.log("🔵 SOCKET: Connected to server");
      setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
      console.log("🔴 SOCKET: Disconnected from server");
      setIsConnected(false);
    });

    newSocket.on("connect_error", (error) => {
      console.error("🔴 SOCKET: Connection error:", error);
      setIsConnected(false);
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
    disconnect: () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    },
  };
};

export default useSocket;
