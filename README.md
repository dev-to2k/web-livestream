# Live Stream Web App

Ứng dụng live stream cơ bản được xây dựng với React.js và Node.js, sử dụng WebRTC cho streaming và Socket.io cho real-time communication.

## Tính năng

- **Live Streaming**: Stream video/audio từ webcam và microphone
- **Real-time Chat**: Chat trực tiếp trong phòng stream
- **Room System**: Tạo và tham gia phòng stream với mã phòng
- **Viewer Count**: Hiển thị số người xem real-time
- **Responsive Design**: Tương thích với mobile và desktop

## Công nghệ sử dụng

### Frontend

- React.js 18
- React Router DOM
- Socket.io Client
- WebRTC API
- CSS3 với Flexbox

### Backend

- Node.js
- Express.js
- Socket.io
- CORS

## Cài đặt và chạy

### 1. Cài đặt dependencies

```bash
# Cài đặt dependencies cho cả client và server
npm run install-all
```

### 2. Chạy ứng dụng

```bash
# Chạy cả client và server cùng lúc
npm run dev
```

Hoặc chạy riêng biệt:

```bash
# Chạy server (port 5000)
npm run server

# Chạy client (port 3000)
npm run client
```

### 3. Truy cập ứng dụng

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Cách sử dụng

1. **Bắt đầu Stream**:

   - Nhập tên của bạn
   - Nhấn "Bắt đầu Stream"
   - Cho phép truy cập camera/microphone
   - Chia sẻ mã phòng với người khác

2. **Tham gia Stream**:

   - Nhập tên của bạn
   - Nhập mã phòng (6 ký tự)
   - Nhấn "Tham gia Stream"

3. **Chat**:
   - Gõ tin nhắn trong khung chat
   - Nhấn Enter để gửi

## Cấu trúc project

```
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Home.js
│   │   │   └── StreamRoom.js
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
├── server/                 # Node.js backend
│   └── index.js
├── package.json
└── README.md
```

## API Endpoints

- `GET /api/rooms` - Lấy danh sách phòng stream

## Socket Events

### Client → Server

- `join-room` - Tham gia phòng
- `offer` - Gửi WebRTC offer
- `answer` - Gửi WebRTC answer
- `ice-candidate` - Gửi ICE candidate
- `chat-message` - Gửi tin nhắn chat

### Server → Client

- `streamer-status` - Trạng thái streamer
- `room-info` - Thông tin phòng
- `user-joined` - Người dùng tham gia
- `user-left` - Người dùng rời phòng
- `chat-message` - Tin nhắn chat mới
- `stream-ended` - Stream kết thúc

## Lưu ý

- Cần HTTPS để WebRTC hoạt động trên production
- Hiện tại chỉ hỗ trợ 1-to-many streaming (1 streamer, nhiều viewer)
- Dữ liệu được lưu trong memory (sẽ mất khi restart server)

## Phát triển tiếp

- [ ] Authentication system
- [ ] Database integration
- [ ] Screen sharing
- [ ] Recording functionality
- [ ] Stream quality controls
- [ ] Mobile app
- [ ] HTTPS deployment
