import React, { useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import styles from "./StreamRoom.module.css";

// Hooks
import useSocket from "../../hooks/useSocket";
import useStreamRoom from "../../hooks/useStreamRoom";
import useWebRTC from "../../hooks/useWebRTC";

// Components
import ChatSection from "../Chat/ChatSection";
import AcceptUsersModal from "../Modals/AcceptUsersModal";
import ShareModal from "../Modals/ShareModal";
import WaitingModal from "../Modals/WaitingModal";
import RoomHeader from "../Stream/RoomHeader";
import StreamControls from "../Stream/StreamControls";
import VideoPlayer from "../Stream/VideoPlayer";
import Spinner from "../UI/Spinner";

// Utils
import { SERVER_URL } from "../../utils/constants";

const StreamRoom = ({ username }) => {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Determine if user is streamer
  const isStreamer = searchParams.get("streamer") === "true";

  // Refs for video elements
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Local state
  const [isStreaming, setIsStreaming] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Custom hooks
  const { socket, isConnected } = useSocket(SERVER_URL);
  const webRTC = useWebRTC(socket, roomId);
  const streamRoom = useStreamRoom(socket, roomId, username, isStreamer);

  // Debug state effect
  React.useEffect(() => {
    console.log(
      "🔵 CLIENT: isWaitingApproval state changed:",
      streamRoom.isWaitingApproval
    );
  }, [streamRoom.isWaitingApproval]);

  // WebRTC event handlers
  React.useEffect(() => {
    if (!socket) return;

    // WebRTC signaling
    socket.on("offer", async ({ offer, streamerId }) => {
      if (!isStreamer) {
        await webRTC.handleOffer(offer, streamerId, remoteVideoRef);
      }
    });

    socket.on("answer", async ({ answer }) => {
      await webRTC.handleAnswer(answer);
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      await webRTC.handleIceCandidate(candidate);
    });

    return () => {
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
    };
  }, [socket, isStreamer, webRTC]);

  // Stream handlers
  const handleStartStream = async () => {
    try {
      setIsLoadingStream(true);
      setStreamError(null);
      console.log("🔵 CLIENT: Starting stream...");

      await webRTC.startStream(localVideoRef);
      setIsStreaming(true);
      setRetryCount(0); // Reset retry count on success
      console.log("🔵 CLIENT: Stream started successfully");
    } catch (error) {
      console.error("🔴 CLIENT: Failed to start stream:", error);

      setIsStreaming(false);
      setStreamError(error);
      setRetryCount((prev) => prev + 1);

      // Show user-friendly error notification
      const errorMessage =
        error.message || "Lỗi không xác định khi bắt đầu stream";
      console.log(
        `🔴 CLIENT: Stream error (attempt ${retryCount + 1}): ${errorMessage}`
      );
    } finally {
      setIsLoadingStream(false);
    }
  };

  const handleStopStream = () => {
    try {
      console.log("🔵 CLIENT: Stopping stream...");
      webRTC.stopStream();
      setIsStreaming(false);
      setStreamError(null);
      setRetryCount(0);

      // Clean up video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }

      console.log("🔵 CLIENT: Stream stopped successfully");
    } catch (error) {
      console.error("🔴 CLIENT: Error stopping stream:", error);
      // Even if there's an error stopping, reset the UI state
      setIsStreaming(false);
      setStreamError(null);
      setRetryCount(0);
    }
  };

  const handleDismissError = () => {
    setStreamError(null);
    setRetryCount(0);
  };

  // Navigation handlers
  const handleLeaveRoom = () => {
    navigate("/");
  };

  const handleShareRoom = () => {
    setShowShareModal(true);
  };

  // Cleanup on unmount only (not on webRTC object changes)
  React.useEffect(() => {
    return () => {
      console.log("🔵 CLIENT: StreamRoom unmounting, cleaning up stream");
      webRTC.stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount/unmount

  if (!isConnected) {
    return (
      <div className={styles.streamContainer}>
        <Spinner 
          size="large" 
          containerType="fullHeight"
          text="Đang kết nối..."
        />
      </div>
    );
  }

  return (
    <div className={styles.streamContainer}>
      <div className={styles.videoSection}>
        <RoomHeader
          roomId={roomId}
          isStreamer={isStreamer}
          onShare={handleShareRoom}
          onLeave={handleLeaveRoom}
        />

        <VideoPlayer
          videoRef={isStreamer ? localVideoRef : remoteVideoRef}
          isStreamer={isStreamer}
          isStreaming={isStreaming}
        />

        <StreamControls
          isStreaming={isStreaming}
          onStartStream={handleStartStream}
          onStopStream={handleStopStream}
          autoAccept={streamRoom.autoAccept}
          onToggleAutoAccept={streamRoom.toggleAutoAccept}
          isStreamer={isStreamer}
          isLoadingStream={isLoadingStream}
          streamError={streamError}
          retryCount={retryCount}
          onDismissError={handleDismissError}
        />

        {/* Debug: Show isStreamer status */}
        {process.env.NODE_ENV === "development" && (
          <div
            style={{
              color: "white",
              padding: "10px",
              background: "rgba(0,0,0,0.5)",
            }}
          >
            Debug: isStreamer = {isStreamer.toString()}
          </div>
        )}
      </div>

      <ChatSection
        messages={streamRoom.messages}
        viewerCount={streamRoom.viewerCount}
        onSendMessage={streamRoom.sendMessage}
        disabled={!isConnected}
      />

      {/* Modals */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        roomId={roomId}
      />

      <AcceptUsersModal
        isOpen={streamRoom.showAcceptModal && isStreamer}
        onClose={() => streamRoom.setShowAcceptModal(false)}
        pendingUsers={streamRoom.pendingUsers}
        onAcceptUser={streamRoom.acceptUser}
        onRejectUser={streamRoom.rejectUser}
        onAcceptAll={streamRoom.acceptAllUsers}
        onRejectAll={streamRoom.rejectAllUsers}
      />

      <WaitingModal
        isOpen={streamRoom.isWaitingApproval}
        isStreamer={isStreamer}
      />

      {/* Debug info - remove in production */}
      {process.env.NODE_ENV === "development" && (
        <div
          style={{
            position: "fixed",
            top: "10px",
            left: "10px",
            background: "rgba(0,0,0,0.8)",
            color: "white",
            padding: "10px",
            borderRadius: "5px",
            fontSize: "12px",
            zIndex: 9999,
          }}
        >
          <div>
            isWaitingApproval: {streamRoom.isWaitingApproval.toString()}
          </div>
          <div>isStreamer: {isStreamer.toString()}</div>
          <div>autoAccept: {streamRoom.autoAccept.toString()}</div>
          <div>connected: {isConnected.toString()}</div>
        </div>
      )}
    </div>
  );
};

export default StreamRoom;
