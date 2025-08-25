import React, { useEffect, useRef } from "react";
import ChatInput from "./ChatInput";
import ChatMessage from "./ChatMessage";

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
    <div className="chat-section">
      <div className="chat-header">
        <h3>Chat</h3>
        <div className="viewer-count">{viewerCount + 1} người xem</div>
      </div>
    
      <div className="chat-messages">
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
