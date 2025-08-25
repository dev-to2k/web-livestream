import { useCallback, useRef, useState, useEffect } from "react";
import { RTC_CONFIG, MEDIA_CONSTRAINTS } from "../utils/constants";
import { handleStreamError, createRetryStrategy } from "../utils/streamErrors";

const useWebRTC = (socket, roomId) => {
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const [connectionState, setConnectionState] = useState('idle'); // idle, connecting, connected, failed, closed
  const [streamState, setStreamState] = useState('idle'); // idle, requesting, active, error

  // Use standardized RTC configuration
  const createPeerConnection = useCallback(
    async (mediaStream) => {
      if (!socket) return;

      const peerConnection = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = peerConnection;
      
      setConnectionState('connecting');

      // Monitor connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log(`🔵 WebRTC: Connection state changed to ${peerConnection.connectionState}`);
        setConnectionState(peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'failed') {
          console.error('🔴 WebRTC: Connection failed');
          // Attempt to restart ICE
          peerConnection.restartIce();
        }
      };
      
      // Monitor ICE connection state
      peerConnection.oniceconnectionstatechange = () => {
        console.log(`🔵 WebRTC: ICE connection state: ${peerConnection.iceConnectionState}`);
      };
      
      // Monitor ICE gathering state
      peerConnection.onicegatheringstatechange = () => {
        console.log(`🔵 WebRTC: ICE gathering state: ${peerConnection.iceGatheringState}`);
      };
      peerConnectionRef.current = peerConnection;

      // Add local stream to peer connection
      mediaStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, mediaStream);
      });

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            candidate: event.candidate,
            roomId,
          });
        }
      };

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit("offer", { offer, roomId });
    },
    [socket, roomId]
  );

  const handleOffer = useCallback(
    async (offer, streamerId, remoteVideoRef) => {
      if (!socket) return;

      const peerConnection = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = peerConnection;

      // Handle incoming stream
      peerConnection.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            candidate: event.candidate,
            roomId,
            targetId: streamerId,
          });
        }
      };

      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit("answer", { answer, streamerId });
    },
    [socket, roomId]
  );

  const handleAnswer = useCallback(async (answer) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.setRemoteDescription(answer);
    }
  }, []);

  const handleIceCandidate = useCallback(async (candidate) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.addIceCandidate(candidate);
    }
  }, []);

  const startStream = useCallback(
    async (localVideoRef) => {
      setStreamState('requesting');
      const retryStrategy = createRetryStrategy(3);
      
      const attemptStream = async (constraints) => {
        console.log(
          "🔵 useWebRTC: Attempting stream with constraints:", constraints
        );

        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(
            "getUserMedia không được hỗ trợ trên trình duyệt này"
          );
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        console.log("🔵 useWebRTC: Media stream obtained:", mediaStream);
        console.log(
          "🔵 useWebRTC: Video tracks:",
          mediaStream.getVideoTracks()
        );
        console.log(
          "🔵 useWebRTC: Audio tracks:",
          mediaStream.getAudioTracks()
        );

        localStreamRef.current = mediaStream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
          console.log("🔵 useWebRTC: Video element srcObject set");

          // Attempt to play video
          try {
            await localVideoRef.current.play();
            console.log("🔵 useWebRTC: Video element playing");
          } catch (playError) {
            console.warn(
              "🟡 useWebRTC: Video autoplay failed (may require user interaction):",
              playError
            );
          }
        }

        await createPeerConnection(mediaStream);
        setStreamState('active');
        return mediaStream;
      };

      try {
        // First attempt with optimal constraints
        return await attemptStream(MEDIA_CONSTRAINTS);
      } catch (error) {
        console.error("🔴 useWebRTC: Primary attempt failed:", error);
        
        const errorInfo = handleStreamError(error);
        
        if (retryStrategy.shouldRetry(error)) {
          const nextAttempt = retryStrategy.getNextAttempt();
          
          if (nextAttempt) {
            console.log(`🟡 useWebRTC: Retrying with fallback constraints after ${nextAttempt.delay}ms`);
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, nextAttempt.delay));
            
            try {
              return await attemptStream(nextAttempt.constraints);
            } catch (retryError) {
              console.error("🔴 useWebRTC: Retry attempt failed:", retryError);
              
              // Try one more time with basic constraints
              const finalAttempt = retryStrategy.getNextAttempt();
              if (finalAttempt) {
                console.log(`🟡 useWebRTC: Final attempt with basic constraints after ${finalAttempt.delay}ms`);
                await new Promise(resolve => setTimeout(resolve, finalAttempt.delay));
                
                try {
                  return await attemptStream(finalAttempt.constraints);
                } catch (finalError) {
                  console.error("🔴 useWebRTC: All attempts failed:", finalError);
                  setStreamState('error');
                  throw handleStreamError(finalError);
                }
              }
              
              throw handleStreamError(retryError);
            }
          }
        }
        
        setStreamState('error');
        throw errorInfo;
      }
    },
    [createPeerConnection]
  );

  const stopStream = useCallback(() => {
    console.log('🔵 useWebRTC: Stopping stream and cleaning up resources');
    
    // Stop all media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log(`🔵 useWebRTC: Stopped ${track.kind} track`);
      });
      localStreamRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      console.log('🔵 useWebRTC: Peer connection closed');
    }
    
    // Reset states
    setStreamState('idle');
    setConnectionState('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🔵 useWebRTC: Component unmounting, cleaning up');
      stopStream();
    };
  }, [stopStream]);

  return {
    startStream,
    stopStream,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    peerConnection: peerConnectionRef.current,
    connectionState,
    streamState,
    isStreaming: streamState === 'active',
    isConnecting: connectionState === 'connecting',
    hasError: streamState === 'error',
  };
};

export default useWebRTC;
