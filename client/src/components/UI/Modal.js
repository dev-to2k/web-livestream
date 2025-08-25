import React from "react";
import styles from './Modal.module.css';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  className = "",
  overlayClassName = "",
  showCloseButton = true,
}) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const overlayClasses = [
    styles.modalOverlay,
    overlayClassName
  ].filter(Boolean).join(' ');

  const contentClasses = [
    styles.modalContent,
    className
  ].filter(Boolean).join(' ');

  return (
    <div
      className={overlayClasses}
      onClick={handleOverlayClick}
    >
      <div
        className={contentClasses}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <div className={styles.modalHeader}>
            {title && <h3>{title}</h3>}
            {showCloseButton && (
              <button className={styles.modalClose} onClick={onClose}>
                ×
              </button>
            )}
          </div>
        )}

        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
