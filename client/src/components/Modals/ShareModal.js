import React from "react";
import { copyToClipboard } from "../../utils/clipboard";
import Button from "../UI/Button";
import Modal from "../UI/Modal";
import styles from './ShareModal.module.css';

const ShareModal = ({ isOpen, onClose, roomId }) => {
  const roomLink = `${window.location.origin}/room/${roomId}`;

  const handleCopyLink = async () => {
    try {
      await copyToClipboard(roomLink);
      alert("Link đã được copy vào clipboard!");
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  };

  const handleCopyCode = async () => {
    try {
      await copyToClipboard(roomId);
      alert("Mã phòng đã được copy vào clipboard!");
    } catch (error) {
      console.error("Failed to copy room code:", error);
    }
  };

  const shareViaWhatsApp = () => {
    const message = `Tham gia stream của tôi tại: ${roomLink}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  };

  const shareViaFacebook = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
      roomLink
    )}`;
    window.open(facebookUrl, "_blank");
  };

  const shareViaTelegram = () => {
    const message = `Tham gia stream của tôi tại: ${roomLink}`;
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(
      roomLink
    )}&text=${encodeURIComponent(message)}`;
    window.open(telegramUrl, "_blank");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Chia sẻ phòng stream">
      <div className={styles.shareSection}>
        <label>Link phòng:</label>
        <div className={styles.shareInputGroup}>
          <input
            type="text"
            value={roomLink}
            readOnly
            className={styles.shareInput}
          />
          <Button variant="primary" size="small" onClick={handleCopyLink}>
            Copy
          </Button>
        </div>
      </div>

      <div className={styles.shareSection}>
        <label>Mã phòng:</label>
        <div className={styles.shareInputGroup}>
          <input type="text" value={roomId} readOnly className={styles.shareInput} />
          <Button variant="primary" size="small" onClick={handleCopyCode}>
            Copy
          </Button>
        </div>
      </div>

      <div className={styles.shareSection}>
        <label>Chia sẻ qua:</label>
        <div className={styles.socialShare}>
          <Button
            variant="whatsapp"
            onClick={shareViaWhatsApp}
            className={styles.socialBtn}
          >
            <span>📱</span> WhatsApp
          </Button>
          <Button
            variant="facebook"
            onClick={shareViaFacebook}
            className={styles.socialBtn}
          >
            <span>📘</span> Facebook
          </Button>
          <Button
            variant="telegram"
            onClick={shareViaTelegram}
            className={styles.socialBtn}
          >
            <span>✈️</span> Telegram
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ShareModal;
