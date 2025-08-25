import React from "react";
import Button from "../UI/Button";
import styles from './RoomHeader.module.css';

const RoomHeader = ({ roomId, isStreamer, onShare, onLeave }) => {
  console.log("🔵 RoomHeader render:", { roomId, isStreamer });

  return (
    <div className={styles.roomHeader}>
      <h2 className={styles.roomTitle}>
        {isStreamer && <span className={styles.crownIcon}>👑</span>}
        Phòng: {roomId}
      </h2>

      <div className={styles.roomActions}>
        {isStreamer && (
          <Button
            variant="success"
            size="small"
            onClick={onShare}
            className={styles.shareBtn}
          >
            Chia sẻ
          </Button>
        )}

        <Button
          variant="danger"
          size="small"
          onClick={onLeave}
          className={styles.leaveBtn}
        >
          Rời phòng
        </Button>
      </div>
    </div>
  );
};

export default RoomHeader;
