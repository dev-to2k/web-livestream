import React from "react";
import Button from "../UI/Button";
import Modal from "../UI/Modal";

const PendingUserItem = ({ user, onAccept, onReject }) => (
  <div className="pending-user-item">
    <div className="user-info">
      <span className="user-avatar">👤</span>
      <span className="user-name">{user.username}</span>
    </div>
    <div className="user-actions">
      <Button
        variant="success"
        size="small"
        onClick={() => onAccept(user.userId)}
        className="accept-btn"
      >
        Chấp nhận
      </Button>
      <Button
        variant="danger"
        size="small"
        onClick={() => onReject(user.userId)}
        className="reject-btn"
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
      className="accept-modal"
    >
      <div className="pending-users-list">
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
        <div className="bulk-actions">
          <Button
            variant="success"
            onClick={onAcceptAll}
            className="bulk-accept-btn"
          >
            Chấp nhận tất cả ({pendingUsers.length})
          </Button>
          <Button
            variant="danger"
            onClick={onRejectAll}
            className="bulk-reject-btn"
          >
            Từ chối tất cả ({pendingUsers.length})
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default AcceptUsersModal;
