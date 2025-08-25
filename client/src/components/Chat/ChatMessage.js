import React from "react";

const ChatMessage = ({ message }) => {
  const { username, message: text, timestamp, isSystem, isStreamer } = message;

  return (
    <div className="chat-message">
      <span className={`message-username ${isSystem ? "system" : ""}`}>
        {isStreamer && <span className="crown-icon-small">👑</span>}
        {username}:
      </span>
      <span className="message-text">{text}</span>
      <div className="message-time">
        {new Date(timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
};

export default ChatMessage;
