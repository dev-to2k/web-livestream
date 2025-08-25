import Button from "../UI/Button";
import Toggle from "../UI/Toggle";

const StreamControls = ({
  isStreaming,
  onStartStream,
  onStopStream,
  autoAccept,
  onToggleAutoAccept,
  isStreamer,
  isLoadingStream = false,
  streamError = null,
}) => {
  console.log("🔵 StreamControls render:", { isStreamer, isStreaming });

  if (!isStreamer) {
    console.log("🔴 StreamControls: Not streamer, returning null");
    return null;
  }

  return (
    <>
      <div className="streamer-privileges">👑 Chủ phòng - Quyền quản lý</div>

      <div className="stream-controls">
        {!isStreaming ? (
          <Button
            variant="control"
            onClick={onStartStream}
            className="control-btn"
            disabled={isLoadingStream}
          >
            {isLoadingStream ? "Đang khởi động..." : "Bắt đầu Stream"}
          </Button>
        ) : (
          <Button
            variant="control"
            onClick={onStopStream}
            className="control-btn active"
            disabled={isLoadingStream}
          >
            Dừng Stream
          </Button>
        )}

        <Toggle
          checked={autoAccept}
          onChange={onToggleAutoAccept}
          label={autoAccept ? "Tự động chấp nhận" : "Xác nhận thủ công"}
          className="auto-accept-control"
          disabled={isLoadingStream}
        />
      </div>

      {/* Error message */}
      {streamError && (
        <div className="stream-error">
          <p style={{ color: "#ff6b6b", margin: "10px 0", fontSize: "14px" }}>
            ❌ {streamError}
          </p>
        </div>
      )}
    </>
  );
};

export default StreamControls;
