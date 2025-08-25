import React, { useEffect, useRef } from "react";
import ChatInput from "./ChatInput";
import ChatMessage from "./ChatMessage";
import styles from './ChatSection.module.css';

const ChatSection = ({
  messages,
  viewerCount,
  onSendMessage,
  disabled = false,
}) => {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className={styles.chatSection}>
      <div className={styles.chatHeader}>
        <h3>Chat</h3>
        <div className={styles.viewerCount}>{viewerCount + 1} người xem</div>
      </div>
    
      <div className={styles.chatMessages}>
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput onSendMessage={onSendMessage} disabled={disabled} />
    </div>
  );
};

export default ChatSection;
