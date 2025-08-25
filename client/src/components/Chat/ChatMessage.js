import React from "react";
import styles from './ChatMessage.module.css';

const ChatMessage = ({ message }) => {
  const { username, message: text, timestamp, isSystem, isStreamer } = message;

  const usernameClasses = [
    styles.messageUsername,
    isSystem && styles.system
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.chatMessage}>
      <span className={usernameClasses}>
        {isStreamer && <span className={styles.crownIconSmall}>👑</span>}
        {username}:
      </span>
      <span className={styles.messageText}>{text}</span>
      <div className={styles.messageTime}>
        {new Date(timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
};

export default ChatMessage;
