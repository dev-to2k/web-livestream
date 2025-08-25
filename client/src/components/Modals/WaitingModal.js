import React from "react";
import { useNavigate } from "react-router-dom";
import Button from "../UI/Button";
import Modal from "../UI/Modal";
import Spinner from "../UI/Spinner";
import styles from './WaitingModal.module.css';

const WaitingModal = ({ isOpen, isStreamer }) => {
  const navigate = useNavigate();

  if (!isOpen || isStreamer) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}} // Prevent closing by clicking overlay
      showCloseButton={false}
      className={styles.waitingModal}
      overlayClassName={styles.waitingOverlay}
    >
      <div className={styles.waitingContent}>
        <Spinner size="large" />

        <h3>Đang chờ xác nhận</h3>
        <p>Streamer đang xem xét yêu cầu tham gia của bạn...</p>
        <p className={styles.waitingNote}>Vui lòng chờ trong giây lát</p>

        <Button
          variant="danger"
          onClick={() => navigate("/")}
          className={styles.cancelWaitingBtn}
        >
          Hủy và về trang chủ
        </Button>
      </div>
    </Modal>
  );
};

export default WaitingModal;
