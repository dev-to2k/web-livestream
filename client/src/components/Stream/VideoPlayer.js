import { useEffect } from "react";

const VideoPlayer = ({
  videoRef,
  isStreamer,
  isStreaming,
  placeholder,
  className = "",
}) => {
  // Debug effect to log video state changes
  useEffect(() => {
    console.log("🔵 VideoPlayer: State changed", {
      isStreamer,
      isStreaming,
      hasVideoRef: !!videoRef?.current,
      videoSrcObject: videoRef?.current?.srcObject,
    });
  }, [isStreamer, isStreaming, videoRef]);

  // Effect to handle video element changes
  useEffect(() => {
    if (videoRef?.current) {
      const videoElement = videoRef.current;

      videoElement.onloadedmetadata = () => {
        console.log("🔵 VideoPlayer: Video metadata loaded", {
          videoWidth: videoElement.videoWidth,
          videoHeight: videoElement.videoHeight,
          duration: videoElement.duration,
        });
      };

      videoElement.onplaying = () => {
        console.log("🔵 VideoPlayer: Video started playing");
      };

      videoElement.onerror = (error) => {
        console.error("🔴 VideoPlayer: Video error:", error);
      };

      videoElement.oncanplay = () => {
        console.log("🔵 VideoPlayer: Video can play");
      };

      return () => {
        videoElement.onloadedmetadata = null;
        videoElement.onplaying = null;
        videoElement.onerror = null;
        videoElement.oncanplay = null;
      };
    }
  }, [videoRef]);

  const getPlaceholderText = () => {
    if (placeholder) return placeholder;

    if (isStreamer && !isStreaming) {
      return 'Nhấn "Bắt đầu Stream" để bắt đầu phát sóng';
    }

    if (!isStreamer) {
      return "Đang chờ streamer bắt đầu phát sóng...";
    }

    return "";
  };

  const shouldShowVideo = () => {
    // Simple check: show video if there's a valid stream source
    return !!videoRef?.current?.srcObject;
  };

  const getVideoClassName = () => {
    const baseClass = "video-element";
    const debugClass = process.env.NODE_ENV === "development" ? "video-element-debug" : "";
    const visibilityClass = shouldShowVideo() ? "video-visible" : "video-hidden";
    return `${baseClass} ${debugClass} ${visibilityClass}`.trim();
  };

  const shouldShowPlaceholder = () => {
    if (isStreamer) {
      return !isStreaming;
    }
    // For viewers, show placeholder if no stream available
    return !videoRef?.current?.srcObject;
  };

  return (
    <div className={`video-container ${className}`}>
      <video
        ref={videoRef}
        className={getVideoClassName()}
        autoPlay
        muted={isStreamer} // Mute local video to prevent feedback
        playsInline
        controls={false}
      />

      {shouldShowPlaceholder() && (
        <div className="video-placeholder">
          <div>{getPlaceholderText()}</div>
        </div>
      )}

      {/* Debug info in development */}
      {process.env.NODE_ENV === "development" && (
        <div className="video-debug-info">
          <div>Streamer: {isStreamer.toString()}</div>
          <div>Streaming: {isStreaming.toString()}</div>
          <div>HasSrc: {(!!videoRef?.current?.srcObject).toString()}</div>
          <div>ShouldShow: {shouldShowVideo().toString()}</div>
          <div>ClassName: {getVideoClassName()}</div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
