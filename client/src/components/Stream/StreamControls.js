import Button from "../UI/Button";
import Toggle from "../UI/Toggle";
import Spinner from "../UI/Spinner";
import StreamErrorDisplay from "../StreamErrorDisplay";
import styles from './StreamControls.module.css';

const StreamControls = ({
  isStreaming,
  onStartStream,
  onStopStream,
  autoAccept,
  onToggleAutoAccept,
  isStreamer,
  isLoadingStream = false,
  streamError = null,
  retryCount = 0,
  onDismissError = null,
}) => {
  console.log("🔵 StreamControls render:", { isStreamer, isStreaming, streamError });

  if (!isStreamer) {
    console.log("🔴 StreamControls: Not streamer, returning null");
    return null;
  }

  return (
    <>
      <div className={styles.streamerPrivileges}>👑 Chủ phòng - Quyền quản lý</div>

      <div className={styles.streamControls}>
        {!isStreaming ? (
          <Button
            variant="control"
            onClick={onStartStream}
            className={styles.controlBtn}
            disabled={isLoadingStream}
          >
            {isLoadingStream ? (
              <>
                <Spinner size="small" />
                Đang khởi động...
              </>
            ) : (
              "Bắt đầu Stream"
            )}
          </Button>
        ) : (
          <Button
            variant="control"
            onClick={onStopStream}
            className={`${styles.controlBtn} ${styles.active}`}
            disabled={isLoadingStream}
          >
            Dừng Stream
          </Button>
        )}

        <Toggle
          checked={autoAccept}
          onChange={onToggleAutoAccept}
          label={autoAccept ? "Tự động chấp nhận" : "Xác nhận thủ công"}
          className={styles.autoAcceptControl}
          disabled={isLoadingStream}
        />
      </div>

      {/* Enhanced error display */}
      <StreamErrorDisplay
        error={streamError}
        onRetry={onStartStream}
        onDismiss={onDismissError}
        isRetrying={isLoadingStream}
        retryCount={retryCount}
        maxRetries={3}
      />
    </>
  );
};

export default StreamControls;
