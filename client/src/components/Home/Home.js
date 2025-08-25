import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  generateRoomId,
  isValidRoomId,
  isValidUsername,
} from "../../utils/roomUtils";
import Button from "../UI/Button";
import Input from "../UI/Input";

const Home = ({ username, setUsername }) => {
  const [roomId, setRoomId] = useState("");
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();

  const validateForm = (checkRoomId = false) => {
    const newErrors = {};

    if (!isValidUsername(username)) {
      newErrors.username = "Tên phải có từ 1-20 ký tự";
    }

    if (checkRoomId && !isValidRoomId(roomId)) {
      newErrors.roomId = "Mã phòng phải có 6 ký tự";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStartStream = () => {
    if (!validateForm()) return;

    const newRoomId = generateRoomId();
    navigate(`/room/${newRoomId}?streamer=true`);
  };

  const handleJoinStream = () => {
    if (!validateForm(true)) return;

    navigate(`/room/${roomId.toUpperCase()}`);
  };

  return (
    <div className="home-container">
      <div className="home-card">
        <h1 className="home-title">Live Stream</h1>

        <Input
          id="username"
          label="Tên của bạn"
          placeholder="Nhập tên của bạn..."
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={20}
          error={errors.username}
        />

        <Input
          id="roomId"
          label="Mã phòng (để tham gia)"
          placeholder="Nhập mã phòng..."
          value={roomId}
          onChange={(e) => setRoomId(e.target.value.toUpperCase())}
          maxLength={6}
          error={errors.roomId}
        />

        <div className="button-group">
          <Button
            variant="primary"
            onClick={handleStartStream}
            disabled={!username.trim()}
          >
            Bắt đầu Stream
          </Button>

          <Button
            variant="secondary"
            onClick={handleJoinStream}
            disabled={!username.trim() || !roomId.trim()}
          >
            Tham gia Stream
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Home;
