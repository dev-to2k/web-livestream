import React from "react";
import Button from "../UI/Button";

const RoomHeader = ({ roomId, isStreamer, onShare, onLeave }) => {
  console.log("🔵 RoomHeader render:", { roomId, isStreamer });

  return (
    <div className="room-header">
      <h2 className="room-title">
        {isStreamer && <span className="crown-icon">👑</span>}
        Phòng: {roomId}
      </h2>

      <div className="room-actions">
        {isStreamer && (
          <Button
            variant="success"
            size="small"
            onClick={onShare}
            className="share-btn"
          >
            Chia sẻ
          </Button>
        )}

        <Button
          variant="danger"
          size="small"
          onClick={onLeave}
          className="leave-btn"
        >
          Rời phòng
        </Button>
      </div>
    </div>
  );
};

export default RoomHeader;
