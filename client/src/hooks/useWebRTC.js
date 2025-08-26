import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { MEDIA_CONSTRAINTS, RTC_CONFIG } from "../utils/constants";
import { createRetryStrategy, handleStreamError } from "../utils/streamErrors";

const useWebRTC = (socket, roomId) => {
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const [connectionState, setConnectionState] = useState("idle"); // idle, connecting, connected, failed, closed
  const [streamState, setStreamState] = useState("idle"); // idle, requesting, active, error
  const [lastError, setLastError] = useState(null);
  const { showWebRTCError, showError, showWarning, showSuccess } = useToast();

  // Enhanced media constraints with fallback options
  const getMediaConstraints = useCallback((quality = "standard") => {
    const constraints = {
      standard: MEDIA_CONSTRAINTS,
      low: {
        video: {
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
          frameRate: { ideal: 15, max: 20 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      },
      basic: {
        video: {
          width: 320,
          height: 240,
          frameRate: 10,
        },
        audio: true,
      },
    };

    return constraints[quality] || constraints.standard;
  }, []);

  // Connection health monitoring
  const monitorConnectionHealth = useCallback((peerConnection) => {
    const startTime = Date.now();
    let healthCheckInterval;

    const checkConnectionHealth = () => {
      if (!peerConnection || peerConnection.connectionState === "closed") {
        clearInterval(healthCheckInterval);
        return;
      }

      const currentState = peerConnection.connectionState;
      const runtime = Date.now() - startTime;

      console.log(`🔵 WebRTC Health Check: ${currentState} (${runtime}ms)`);

      // Handle connection failures
      if (currentState === "failed" && runtime > 5000) {
        console.log("🟡 WebRTC: Connection failed, attempting ICE restart");
        try {
          peerConnection.restartIce();
        } catch (error) {
          console.error("🔴 WebRTC: ICE restart failed:", error);
        }
      }

      // Clear interval after successful connection or timeout
      if (currentState === "connected" || runtime > 30000) {
        clearInterval(healthCheckInterval);
      }
    };

    healthCheckInterval = setInterval(checkConnectionHealth, 1000);
    return () => clearInterval(healthCheckInterval);
  }, []);
  const createPeerConnection = useCallback(
    async (mediaStream) => {
      if (!socket) {
        throw new Error("Socket connection not available");
      }

      console.log(
        "🔵 WebRTC: Creating peer connection with RTC config:",
        RTC_CONFIG
      );
      const peerConnection = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = peerConnection;

      setConnectionState("connecting");
      setLastError(null);

      // Enhanced connection state monitoring
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log(`🔵 WebRTC: Connection state changed to ${state}`);
        setConnectionState(state);

        if (state === "connected") {
          console.log("🚀 WebRTC: Peer connection established successfully!");
          setLastError(null);
          showSuccess("Kết nối streaming thành công!", {
            title: "Streaming",
            duration: 3000,
          });
        } else if (state === "failed") {
          console.error("🔴 WebRTC: Connection failed");
          const error = {
            type: "connection",
            message: "Peer connection failed",
            timestamp: Date.now(),
          };
          setLastError(error);
          showWebRTCError(error, {
            title: "Lỗi kết nối WebRTC",
            onRetry: () => {
              // Retry connection
              try {
                peerConnection.restartIce();
              } catch (restartError) {
                console.error("Failed to restart ICE:", restartError);
              }
            },
          });
        } else if (state === "disconnected") {
          console.log(
            "🟡 WebRTC: Connection disconnected, may reconnect automatically"
          );
          showWarning(
            "Kết nối streaming bị gián đoạn. Đang thử kết nối lại...",
            {
              title: "Streaming",
              duration: 4000,
            }
          );
        }
      };

      // Enhanced ICE connection state monitoring
      peerConnection.oniceconnectionstatechange = () => {
        const iceState = peerConnection.iceConnectionState;
        console.log(`🔵 WebRTC: ICE connection state: ${iceState}`);

        if (iceState === "failed") {
          console.log("🟡 WebRTC: ICE connection failed, attempting restart");
          showWarning("Kết nối mạng gặp sự cố. Đang thử khôi phục...", {
            title: "Lỗi kết nối",
            duration: 5000,
          });
          try {
            peerConnection.restartIce();
          } catch (error) {
            console.error("🔴 WebRTC: Failed to restart ICE:", error);
            showError("Không thể khôi phục kết nối mạng. Vui lòng thử lại.", {
              title: "Lỗi kết nối",
            });
          }
        } else if (iceState === "connected" || iceState === "completed") {
          console.log("🚀 WebRTC: ICE connection established");
        }
      };

      // ICE gathering state monitoring
      peerConnection.onicegatheringstatechange = () => {
        console.log(
          `🔵 WebRTC: ICE gathering state: ${peerConnection.iceGatheringState}`
        );
      };

      // Start connection health monitoring
      const stopHealthMonitoring = monitorConnectionHealth(peerConnection);

      // Add local stream to peer connection with enhanced error handling
      try {
        mediaStream.getTracks().forEach((track) => {
          console.log(
            `🔵 WebRTC: Adding ${track.kind} track to peer connection`
          );
          peerConnection.addTrack(track, mediaStream);
        });
      } catch (error) {
        console.error("🔴 WebRTC: Failed to add tracks:", error);
        throw new Error(`Failed to add media tracks: ${error.message}`);
      }

      // Enhanced ICE candidate handling
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("🔵 WebRTC: Sending ICE candidate");
          socket.emit("ice-candidate", {
            candidate: event.candidate,
            roomId,
            timestamp: Date.now(),
          });
        } else {
          console.log("🔵 WebRTC: ICE candidate gathering complete");
        }
      };

      // Create and send offer with error handling
      try {
        console.log("🔵 WebRTC: Creating offer...");
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });

        console.log("🔵 WebRTC: Setting local description...");
        await peerConnection.setLocalDescription(offer);

        console.log("🔵 WebRTC: Sending offer to room:", roomId);
        socket.emit("offer", {
          offer,
          roomId,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("🔴 WebRTC: Failed to create/send offer:", error);
        stopHealthMonitoring();
        throw new Error(`Failed to create offer: ${error.message}`);
      }

      // Cleanup function
      return () => {
        stopHealthMonitoring();
      };
    },
    [
      socket,
      monitorConnectionHealth,
      showSuccess,
      showWebRTCError,
      showWarning,
      showError,
      roomId,
    ]
  );

  const handleOffer = useCallback(
    async (offer, streamerId, remoteVideoRef) => {
      if (!socket) {
        console.error("🔴 WebRTC: Socket not available for handling offer");
        return;
      }

      console.log("🔵 WebRTC: Handling offer from streamer:", streamerId);

      try {
        const peerConnection = new RTCPeerConnection(RTC_CONFIG);
        peerConnectionRef.current = peerConnection;
        setConnectionState("connecting");

        // Enhanced connection monitoring for viewers
        peerConnection.onconnectionstatechange = () => {
          const state = peerConnection.connectionState;
          console.log(`🔵 WebRTC Viewer: Connection state changed to ${state}`);
          setConnectionState(state);
        };

        // Enhanced stream handling
        peerConnection.ontrack = (event) => {
          console.log("🔵 WebRTC: Received remote stream:", event.streams[0]);
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
            console.log("🔵 WebRTC: Remote video element updated with stream");

            // Attempt to play the video
            remoteVideoRef.current.play().catch((error) => {
              console.warn("🟡 WebRTC: Remote video autoplay failed:", error);
            });
          }
        };

        // Enhanced ICE candidate handling
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("🔵 WebRTC: Sending ICE candidate to streamer");
            socket.emit("ice-candidate", {
              candidate: event.candidate,
              roomId,
              targetId: streamerId,
              timestamp: Date.now(),
            });
          }
        };

        // Set remote description and create answer
        console.log("🔵 WebRTC: Setting remote description...");
        await peerConnection.setRemoteDescription(offer);

        console.log("🔵 WebRTC: Creating answer...");
        const answer = await peerConnection.createAnswer();

        console.log("🔵 WebRTC: Setting local description...");
        await peerConnection.setLocalDescription(answer);

        console.log("🔵 WebRTC: Sending answer to streamer");
        socket.emit("answer", {
          answer,
          streamerId,
          timestamp: Date.now(),
        });

        // Start health monitoring
        monitorConnectionHealth(peerConnection);
      } catch (error) {
        console.error("🔴 WebRTC: Failed to handle offer:", error);
        setLastError({
          type: "offer_handling",
          message: error.message,
          timestamp: Date.now(),
        });
        throw error;
      }
    },
    [socket, roomId, monitorConnectionHealth]
  );

  const handleAnswer = useCallback(async (answer) => {
    if (!peerConnectionRef.current) {
      console.error("🔴 WebRTC: No peer connection available for answer");
      return;
    }

    try {
      console.log("🔵 WebRTC: Setting remote description from answer");
      await peerConnectionRef.current.setRemoteDescription(answer);
      console.log("🔵 WebRTC: Answer processed successfully");
    } catch (error) {
      console.error("🔴 WebRTC: Failed to handle answer:", error);
      setLastError({
        type: "answer_handling",
        message: error.message,
        timestamp: Date.now(),
      });
    }
  }, []);

  const handleIceCandidate = useCallback(async (candidate) => {
    if (!peerConnectionRef.current) {
      console.warn("🟡 WebRTC: No peer connection available for ICE candidate");
      return;
    }

    try {
      console.log("🔵 WebRTC: Adding ICE candidate");
      await peerConnectionRef.current.addIceCandidate(candidate);
      console.log("🔵 WebRTC: ICE candidate added successfully");
    } catch (error) {
      // ICE candidate errors are often non-fatal, log as warning
      console.warn(
        "🟡 WebRTC: Failed to add ICE candidate (non-fatal):",
        error
      );
    }
  }, []);

  const startStream = useCallback(
    async (localVideoRef) => {
      console.log("🔵 useWebRTC: Starting stream process...");
      setStreamState("requesting");
      setLastError(null);

      const retryStrategy = createRetryStrategy(3);
      let peerConnectionCleanup = null;

      const attemptStream = async (constraints, attemptNumber = 1) => {
        console.log(
          `🔵 useWebRTC: Stream attempt ${attemptNumber} with constraints:`,
          JSON.stringify(constraints, null, 2)
        );

        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(
            "getUserMedia không được hỗ trợ trên trình duyệt này"
          );
        }

        let mediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (getUserMediaError) {
          console.error(
            `🔴 useWebRTC: getUserMedia failed on attempt ${attemptNumber}:`,
            getUserMediaError
          );
          throw getUserMediaError;
        }

        console.log("🔵 useWebRTC: Media stream obtained:", mediaStream);
        console.log(
          "🔵 useWebRTC: Video tracks:",
          mediaStream.getVideoTracks().map((t) => ({
            id: t.id,
            label: t.label,
            enabled: t.enabled,
            readyState: t.readyState,
          }))
        );
        console.log(
          "🔵 useWebRTC: Audio tracks:",
          mediaStream.getAudioTracks().map((t) => ({
            id: t.id,
            label: t.label,
            enabled: t.enabled,
            readyState: t.readyState,
          }))
        );

        // Store stream reference
        localStreamRef.current = mediaStream;

        // Set up video element
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
          console.log("🔵 useWebRTC: Video element srcObject set");

          // Enhanced video play handling
          try {
            // Wait a bit for the video element to be ready
            await new Promise((resolve) => setTimeout(resolve, 100));

            await localVideoRef.current.play();
            console.log("🔵 useWebRTC: Video element playing successfully");
          } catch (playError) {
            console.warn(
              "🟡 useWebRTC: Video autoplay failed (user interaction may be required):",
              playError
            );
            // This is often not a critical error, as user can click play
          }
        } else {
          console.warn("🟡 useWebRTC: No video reference provided");
        }

        // Create peer connection and handle cleanup
        try {
          peerConnectionCleanup = await createPeerConnection(mediaStream);
          console.log("🔵 useWebRTC: Peer connection created successfully");
        } catch (peerError) {
          console.error(
            "🔴 useWebRTC: Failed to create peer connection:",
            peerError
          );
          // Clean up media stream if peer connection fails
          mediaStream.getTracks().forEach((track) => {
            track.stop();
            console.log(
              `🔵 useWebRTC: Stopped ${track.kind} track due to peer connection failure`
            );
          });
          throw peerError;
        }

        setStreamState("active");
        console.log("🚀 useWebRTC: Stream started successfully!");
        return mediaStream;
      };

      try {
        // First attempt with standard quality
        const result = await attemptStream(getMediaConstraints("standard"), 1);
        showSuccess("Stream đã bắt đầu thành công!", {
          title: "Streaming",
          duration: 3000,
        });
        return result;
      } catch (error) {
        console.error("🔴 useWebRTC: Primary attempt failed:", error);

        const errorInfo = handleStreamError(error);
        setLastError(errorInfo);

        // Show initial error toast
        showWebRTCError(error, {
          title: "Lỗi khởi động stream",
        });

        if (retryStrategy.shouldRetry(error)) {
          const nextAttempt = retryStrategy.getNextAttempt();

          if (nextAttempt) {
            console.log(
              `🟡 useWebRTC: Retrying with ${nextAttempt.quality} quality after ${nextAttempt.delay}ms`
            );

            showWarning(
              `Đang thử lại với chất lượng ${nextAttempt.quality}...`,
              {
                title: "Thử lại",
                duration: nextAttempt.delay + 1000,
              }
            );

            // Wait before retry
            await new Promise((resolve) =>
              setTimeout(resolve, nextAttempt.delay)
            );

            try {
              const result = await attemptStream(nextAttempt.constraints, 2);
              showSuccess("Stream đã bắt đầu thành công sau khi thử lại!", {
                title: "Streaming",
                duration: 4000,
              });
              return result;
            } catch (retryError) {
              console.error("🔴 useWebRTC: Retry attempt failed:", retryError);

              // Try one more time with basic constraints
              const finalAttempt = retryStrategy.getNextAttempt();
              if (finalAttempt) {
                console.log(
                  `🟡 useWebRTC: Final attempt with ${finalAttempt.quality} quality after ${finalAttempt.delay}ms`
                );

                showWarning(
                  `Lần thử cuối với chất lượng ${finalAttempt.quality}...`,
                  {
                    title: "Thử lại lần cuối",
                    duration: finalAttempt.delay + 1000,
                  }
                );

                await new Promise((resolve) =>
                  setTimeout(resolve, finalAttempt.delay)
                );

                try {
                  const result = await attemptStream(
                    finalAttempt.constraints,
                    3
                  );
                  showSuccess("Stream đã bắt đầu với chất lượng cơ bản!", {
                    title: "Streaming",
                    duration: 4000,
                  });
                  return result;
                } catch (finalError) {
                  console.error(
                    "🔴 useWebRTC: All attempts failed:",
                    finalError
                  );
                  const finalErrorInfo = handleStreamError(finalError);
                  setStreamState("error");
                  setLastError(finalErrorInfo);

                  showWebRTCError(finalError, {
                    title: "Không thể khởi động stream",
                    onRetry: () => {
                      // Retry the entire startStream process
                      startStream(localVideoRef);
                    },
                  });

                  throw finalErrorInfo;
                }
              }

              const retryErrorInfo = handleStreamError(retryError);
              setStreamState("error");
              setLastError(retryErrorInfo);

              showWebRTCError(retryError, {
                title: "Lỗi khi thử lại",
                onRetry: () => {
                  startStream(localVideoRef);
                },
              });

              throw retryErrorInfo;
            }
          }
        }

        setStreamState("error");
        showWebRTCError(errorInfo, {
          title: "Không thể khởi động stream",
          onRetry: () => {
            startStream(localVideoRef);
          },
        });
        throw errorInfo;
      } finally {
        // Clean up peer connection if it was created but stream failed
        if (streamState === "error" && peerConnectionCleanup) {
          try {
            peerConnectionCleanup();
          } catch (cleanupError) {
            console.warn("🟡 useWebRTC: Cleanup error:", cleanupError);
          }
        }
      }
    },
    [createPeerConnection, getMediaConstraints, streamState]
  );

  const stopStream = useCallback(() => {
    console.log("🔵 useWebRTC: Stopping stream and cleaning up resources");

    // Stop all media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log(
          `🔵 useWebRTC: Stopped ${track.kind} track (${track.label})`
        );
      });
      localStreamRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      // First, remove all tracks
      const senders = peerConnectionRef.current.getSenders();
      senders.forEach((sender) => {
        if (sender.track) {
          peerConnectionRef.current.removeTrack(sender);
        }
      });

      // Close the connection
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      console.log("🔵 useWebRTC: Peer connection closed");
    }

    // Reset states
    setStreamState("idle");
    setConnectionState("idle");
    setLastError(null);

    // Show success notification
    showSuccess("Đã dừng stream thành công!", {
      title: "Streaming",
      duration: 2000,
    });

    console.log("🔵 useWebRTC: Stream cleanup completed");
  }, [showSuccess]);

  // Cleanup on unmount only (not on stopStream changes)
  useEffect(() => {
    return () => {
      console.log("🔵 useWebRTC: Component unmounting, cleaning up");
      // Call stopStream directly to avoid dependency issues
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          track.stop();
          console.log(
            `🔵 useWebRTC: Stopped ${track.kind} track (${track.label})`
          );
        });
        localStreamRef.current = null;
      }

      if (peerConnectionRef.current) {
        const senders = peerConnectionRef.current.getSenders();
        senders.forEach((sender) => {
          if (sender.track) {
            peerConnectionRef.current.removeTrack(sender);
          }
        });
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
        console.log("🔵 useWebRTC: Peer connection closed");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount/unmount

  return useMemo(
    () => ({
      // Core functions
      startStream,
      stopStream,
      handleOffer,
      handleAnswer,
      handleIceCandidate,

      // State information
      peerConnection: peerConnectionRef.current,
      localStream: localStreamRef.current,
      connectionState,
      streamState,
      lastError,

      // Computed state helpers
      isStreaming: streamState === "active",
      isConnecting:
        streamState === "requesting" || connectionState === "connecting",
      hasError: streamState === "error" || !!lastError,
      isConnected: connectionState === "connected",
      isIdle: streamState === "idle" && connectionState === "idle",

      // Utility functions
      getMediaConstraints,
    }),
    [
      startStream,
      stopStream,
      handleOffer,
      handleAnswer,
      handleIceCandidate,
      connectionState,
      streamState,
      lastError,
      getMediaConstraints,
    ]
  );
};

export default useWebRTC;
