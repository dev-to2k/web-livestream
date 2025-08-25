import React from "react";
import Button from "../UI/Button";
import Modal from "../UI/Modal";
import styles from './AcceptUsersModal.module.css';

const PendingUserItem = ({ user, onAccept, onReject }) => (
  <div className={styles.pendingUserItem}>
    <div className={styles.userInfo}>
      <span className={styles.userAvatar}>👤</span>
      <span className={styles.userName}>{user.username}</span>
    </div>
    <div className={styles.userActions}>
      <Button
        variant="success"
        size="small"
        onClick={() => onAccept(user.userId)}
        className={styles.acceptBtn}
      >
        Chấp nhận
      </Button>
      <Button
        variant="danger"
        size="small"
        onClick={() => onReject(user.userId)}
        className={styles.rejectBtn}
      >
        Từ chối
      </Button>
    </div>
  </div>
);

const AcceptUsersModal = ({
  isOpen,
  onClose,
  pendingUsers,
  onAcceptUser,
  onRejectUser,
  onAcceptAll,
  onRejectAll,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Yêu cầu tham gia phòng"
      className={styles.acceptModal}
    >
      <div className={styles.pendingUsersList}>
        {pendingUsers.map((user) => (
          <PendingUserItem
            key={user.userId}
            user={user}
            onAccept={onAcceptUser}
            onReject={onRejectUser}
          />
        ))}
      </div>

      {pendingUsers.length > 1 && (
        <div className={styles.bulkActions}>
          <Button
            variant="success"
            onClick={onAcceptAll}
            className={styles.bulkAcceptBtn}
          >
            Chấp nhận tất cả ({pendingUsers.length})
          </Button>
          <Button
            variant="danger"
            onClick={onRejectAll}
            className={styles.bulkRejectBtn}
          >
            Từ chối tất cả ({pendingUsers.length})
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default AcceptUsersModal;
