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
          <div className="error-message">
            ❌ {typeof streamError === 'object' ? streamError.message : streamError}
          </div>
          {typeof streamError === 'object' && streamError.userAction && (
            <div className="error-action">
              <strong>Hướng dẫn:</strong> {streamError.userAction}
            </div>
          )}
          {typeof streamError === 'object' && streamError.recoverable && (
            <button 
              className="retry-btn" 
              onClick={onStartStream}
              disabled={isLoadingStream}
              style={{
                marginTop: '10px',
                padding: '5px 15px',
                background: '#ff6b6b',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Thử lại
            </button>
          )}
        </div>
      )}
    </>
  );
};

export default StreamControls;
