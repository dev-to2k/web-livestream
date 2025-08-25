import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isValidUsername } from "../../utils/roomUtils";
import Button from "../UI/Button";
import Input from "../UI/Input";

const QuickJoin = ({ setUsername }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [tempUsername, setTempUsername] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");

  const handleQuickJoin = () => {
    if (!isValidUsername(tempUsername)) {
      setError("Tên phải có từ 1-20 ký tự");
      return;
    }

    setError("");
    setIsJoining(true);
    setUsername(tempUsername.trim());

    // Small delay to ensure username is set
    setTimeout(() => {
      navigate(`/room/${roomId}`, { replace: true });
    }, 100);
  };

  const goHome = () => {
    navigate("/");
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !isJoining) {
      handleQuickJoin();
    }
  };

  return (
    <div className="home-container">
      <div className="home-card">
        <h1 className="home-title">Tham gia phòng</h1>
        <p className="room-info">
          Phòng: <strong>{roomId}</strong>
        </p>

        <Input
          id="quickUsername"
          label="Tên của bạn"
          placeholder="Nhập tên của bạn..."
          value={tempUsername}
          onChange={(e) => setTempUsername(e.target.value)}
          onKeyPress={handleKeyPress}
          maxLength={20}
          disabled={isJoining}
          error={error}
        />

        <div className="button-group">
          <Button
            variant="primary"
            onClick={handleQuickJoin}
            disabled={!tempUsername.trim() || isJoining}
          >
            {isJoining ? "Đang tham gia..." : "Tham gia phòng"}
          </Button>

          <Button variant="secondary" onClick={goHome} disabled={isJoining}>
            Về trang chủ
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuickJoin;
