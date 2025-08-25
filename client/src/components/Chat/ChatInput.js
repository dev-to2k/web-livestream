import React, { useState } from "react";
import styles from './ChatInput.module.css';

const ChatInput = ({ onSendMessage, disabled = false }) => {
  const [message, setMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message);
      setMessage("");
    }
  };

  return (
    <form className={styles.chatInput} onSubmit={handleSubmit}>
      <input
        type="text"
        className={styles.chatInputField}
        placeholder="Nhập tin nhắn..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={200}
        disabled={disabled}
      />
    </form>
  );
};

export default ChatInput;
