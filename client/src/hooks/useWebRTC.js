import { useCallback, useRef } from "react";

const useWebRTC = (socket, roomId) => {
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  // WebRTC configuration
  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  const createPeerConnection = useCallback(
    async (mediaStream) => {
      if (!socket) return;

      const peerConnection = new RTCPeerConnection(rtcConfig);
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

      const peerConnection = new RTCPeerConnection(rtcConfig);
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
      try {
        console.log(
          "🔵 useWebRTC: Starting stream, requesting media access..."
        );

        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(
            "getUserMedia không được hỗ trợ trên trình duyệt này"
          );
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 15, max: 30 },
          },
          audio: true,
        });

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

          // Force video to play
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
        return mediaStream;
      } catch (error) {
        console.error("🔴 useWebRTC: Error accessing media devices:", error);

        let errorMessage = "Không thể truy cập camera/microphone. ";

        if (error.name === "NotAllowedError") {
          errorMessage +=
            "Vui lòng cho phép truy cập camera và microphone trong trình duyệt.";
        } else if (error.name === "NotFoundError") {
          errorMessage += "Không tìm thấy camera hoặc microphone.";
        } else if (error.name === "NotReadableError") {
          errorMessage +=
            "Camera hoặc microphone đang được sử dụng bởi ứng dụng khác.";
        } else {
          errorMessage += error.message || "Lỗi không xác định.";
        }

        throw new Error(errorMessage);
      }
    },
    [createPeerConnection]
  );

  const stopStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  }, []);

  return {
    startStream,
    stopStream,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    peerConnection: peerConnectionRef.current,
  };
};

export default useWebRTC;
