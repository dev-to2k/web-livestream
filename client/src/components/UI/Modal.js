import React from "react";

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

  return (
    <div
      className={`modal-overlay ${overlayClassName}`}
      onClick={handleOverlayClick}
    >
      <div
        className={`modal-content ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <div className="modal-header">
            {title && <h3>{title}</h3>}
            {showCloseButton && (
              <button className="modal-close" onClick={onClose}>
                ×
              </button>
            )}
          </div>
        )}

        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
