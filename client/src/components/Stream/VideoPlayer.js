import { useEffect, useState } from "react";
import styles from './VideoPlayer.module.css';

const VideoPlayer = ({
  videoRef,
  isStreamer,
  isStreaming,
  placeholder,
  className = "",
}) => {
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(null);

  // Debug effect to log video state changes
  useEffect(() => {
    console.log("🔵 VideoPlayer: State changed", {
      isStreamer,
      isStreaming,
      hasVideoRef: !!videoRef?.current,
      videoSrcObject: !!videoRef?.current?.srcObject,
      videoReady,
    });
  }, [isStreamer, isStreaming, videoRef, videoReady]);

  // Effect to handle video element changes
  useEffect(() => {
    if (videoRef?.current) {
      const videoElement = videoRef.current;

      const handleLoadedMetadata = () => {
        console.log("🔵 VideoPlayer: Video metadata loaded", {
          videoWidth: videoElement.videoWidth,
          videoHeight: videoElement.videoHeight,
          duration: videoElement.duration,
        });
        setVideoReady(true);
        setVideoError(null);
      };

      const handlePlaying = () => {
        console.log("🔵 VideoPlayer: Video started playing");
        setVideoReady(true);
      };

      const handleError = (error) => {
        console.error("🔴 VideoPlayer: Video error:", error);
        setVideoError("Video playback error");
        setVideoReady(false);
      };

      const handleCanPlay = () => {
        console.log("🔵 VideoPlayer: Video can play");
        setVideoReady(true);
      };

      const handleLoadStart = () => {
        console.log("🔵 VideoPlayer: Video load started");
        setVideoReady(false);
        setVideoError(null);
      };

      // Add event listeners
      videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.addEventListener('playing', handlePlaying);
      videoElement.addEventListener('error', handleError);
      videoElement.addEventListener('canplay', handleCanPlay);
      videoElement.addEventListener('loadstart', handleLoadStart);

      return () => {
        videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        videoElement.removeEventListener('playing', handlePlaying);
        videoElement.removeEventListener('error', handleError);
        videoElement.removeEventListener('canplay', handleCanPlay);
        videoElement.removeEventListener('loadstart', handleLoadStart);
      };
    }
  }, [videoRef]);

  // Reset video ready state when srcObject changes
  useEffect(() => {
    if (videoRef?.current) {
      const hasSrcObject = !!videoRef.current.srcObject;
      if (!hasSrcObject) {
        setVideoReady(false);
        setVideoError(null);
      }
    }
  }, [videoRef?.current?.srcObject]);

  const getPlaceholderText = () => {
    if (placeholder) return placeholder;

    if (videoError) {
      return `Lỗi video: ${videoError}`;
    }

    if (isStreamer && !isStreaming) {
      return 'Nhấn "Bắt đầu Stream" để bắt đầu phát sóng';
    }

    if (!isStreamer && !videoRef?.current?.srcObject) {
      return "Đang chờ streamer bắt đầu phát sóng...";
    }

    if (videoRef?.current?.srcObject && !videoReady) {
      return "Đang tải video...";
    }

    return "";
  };

  // Simplified video visibility logic
  const shouldShowVideo = () => {
    // Show video only if there's a valid stream source AND video is ready
    return !!videoRef?.current?.srcObject && videoReady && !videoError;
  };

  const getVideoClassName = () => {
    const baseClasses = [styles.videoElement];
    
    if (process.env.NODE_ENV === "development") {
      baseClasses.push(styles.videoElementDebug);
    }
    
    if (shouldShowVideo()) {
      baseClasses.push(styles.videoVisible);
    } else {
      baseClasses.push(styles.videoHidden);
    }
    
    return baseClasses.join(' ');
  };

  const shouldShowPlaceholder = () => {
    // Show placeholder when video should not be shown
    return !shouldShowVideo();
  };

  const containerClasses = [
    styles.videoContainer,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      <video
        ref={videoRef}
        className={getVideoClassName()}
        autoPlay
        muted={isStreamer} // Mute local video to prevent feedback
        playsInline
        controls={false}
      />

      {shouldShowPlaceholder() && (
        <div className={styles.videoPlaceholder}>
          <div>{getPlaceholderText()}</div>
        </div>
      )}

      {/* Debug info in development */}
      {process.env.NODE_ENV === "development" && (
        <div className={styles.videoDebugInfo}>
          <div>Streamer: {isStreamer.toString()}</div>
          <div>Streaming: {isStreaming.toString()}</div>
          <div>HasSrc: {(!!videoRef?.current?.srcObject).toString()}</div>
          <div>VideoReady: {videoReady.toString()}</div>
          <div>ShouldShow: {shouldShowVideo().toString()}</div>
          <div>Error: {videoError || 'none'}</div>
          <div>ClassName: {getVideoClassName()}</div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
