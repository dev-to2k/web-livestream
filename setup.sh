#!/bin/bash

# High-Performance Scalable Live Streaming Server Setup Script
# This script sets up the entire infrastructure for 1000+ concurrent users

set -e

echo "🚀 Setting up High-Performance Scalable Live Streaming Server"
echo "⚡ Target: 1000+ concurrent users per room without lag"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}📊 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Docker is installed
check_docker() {
    print_status "Checking Docker installation..."
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    print_success "Docker and Docker Compose are installed"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    
    mkdir -p haproxy/certs
    mkdir -p mongodb
    mkdir -p monitoring/prometheus
    mkdir -p monitoring/grafana/dashboards
    mkdir -p monitoring/grafana/provisioning
    mkdir -p logs
    mkdir -p sfu
    
    print_success "Directories created"
}

# Install dependencies
install_dependencies() {
    print_status "Installing Node.js dependencies..."
    
    # Install server dependencies
    cd server
    npm install
    
    # Install client dependencies
    cd ../client
    npm install
    
    cd ..
    
    print_success "Dependencies installed"
}

# Setup monitoring configuration
setup_monitoring() {
    print_status "Setting up monitoring configuration..."
    
    # Create Prometheus configuration
    cat > monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  # - "first_rules.yml"
  # - "second_rules.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'livestream-servers'
    static_configs:
      - targets: ['websocket-server-1:5000', 'websocket-server-2:5000', 'api-server-1:5000', 'api-server-2:5000']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'sfu-servers'
    static_configs:
      - targets: ['sfu-server-1:3478', 'sfu-server-2:3478']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'redis-cluster'
    static_configs:
      - targets: ['redis-cluster-1:6379', 'redis-cluster-2:6380', 'redis-cluster-3:6381']

  - job_name: 'mongodb'
    static_configs:
      - targets: ['mongodb-primary:27017', 'mongodb-secondary:27017']
EOF

    # Create Grafana dashboard
    cat > monitoring/grafana/dashboards/livestream-dashboard.json << 'EOF'
{
  "dashboard": {
    "id": null,
    "title": "Live Streaming Performance Dashboard",
    "tags": ["livestream", "scalable"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Active Connections",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(livestream_active_connections)",
            "legendFormat": "Total Connections"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0}
      },
      {
        "id": 2,
        "title": "Active Rooms",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(livestream_active_rooms)",
            "legendFormat": "Total Rooms"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0}
      },
      {
        "id": 3,
        "title": "Message Latency",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, livestream_message_latency_seconds)",
            "legendFormat": "95th Percentile"
          },
          {
            "expr": "histogram_quantile(0.50, livestream_message_latency_seconds)",
            "legendFormat": "50th Percentile"
          }
        ],
        "gridPos": {"h": 8, "w": 24, "x": 0, "y": 8}
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "refresh": "5s"
  }
}
EOF

    print_success "Monitoring configuration created"
}

# Setup MongoDB replica set initialization
setup_mongodb() {
    print_status "Setting up MongoDB replica set initialization..."
    
    cat > mongodb/init-replica.js << 'EOF'
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongodb-primary:27017", priority: 2 },
    { _id: 1, host: "mongodb-secondary:27017", priority: 1 }
  ]
});

// Create livestream database and collections
use livestream;

// Create indexes for performance
db.rooms.createIndex({ "roomId": 1 }, { unique: true });
db.rooms.createIndex({ "status": 1, "createdAt": -1 });
db.users.createIndex({ "socketId": 1 }, { unique: true });
db.users.createIndex({ "roomId": 1, "isStreamer": -1 });
db.messages.createIndex({ "roomId": 1, "timestamp": -1 });
db.connectionstates.createIndex({ "socketId": 1 }, { unique: true });

// Create admin user
db.createUser({
  user: "livestream",
  pwd: "livestream123",
  roles: [
    { role: "readWrite", db: "livestream" }
  ]
});

print("MongoDB replica set initialized successfully");
EOF

    print_success "MongoDB setup script created"
}

# Setup SFU server
setup_sfu() {
    print_status "Setting up SFU (Selective Forwarding Unit) server..."
    
    # Create SFU package.json
    cat > sfu/package.json << 'EOF'
{
  "name": "livestream-sfu",
  "version": "1.0.0",
  "description": "SFU server for high-performance live streaming",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "mediasoup": "^3.12.9",
    "express": "^4.18.2",
    "socket.io": "^4.7.2",
    "redis": "^4.6.8",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF

    # Create basic SFU server
    cat > sfu/index.js << 'EOF'
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mediasoup = require('mediasoup');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let worker;
let router;

async function createWorker() {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: process.env.MEDIASOUP_MIN_PORT || 40000,
    rtcMaxPort: process.env.MEDIASOUP_MAX_PORT || 40100,
  });

  console.log('✅ SFU: MediaSoup worker created');

  worker.on('died', (error) => {
    console.error('❌ SFU: MediaSoup worker died:', error);
    setTimeout(() => process.exit(1), 2000);
  });

  const mediaCodecs = [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: 'video',
      mimeType: 'video/VP8',
      clockRate: 90000,
      parameters: {
        'x-google-start-bitrate': 1000,
      },
    },
  ];

  router = await worker.createRouter({ mediaCodecs });
  console.log('✅ SFU: MediaSoup router created');
}

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    worker: worker ? 'running' : 'stopped',
    router: router ? 'active' : 'inactive'
  });
});

const PORT = process.env.PORT || 3478;
server.listen(PORT, () => {
  console.log(`🚀 SFU: Server running on port ${PORT}`);
  createWorker();
});
EOF

    # Create SFU Dockerfile
    cat > sfu/Dockerfile << 'EOF'
FROM node:18-alpine

WORKDIR /app

# Install system dependencies for mediasoup
RUN apk add --no-cache python3 make g++ git curl

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3478
EXPOSE 40000-40100/udp

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3478/health || exit 1

CMD ["node", "index.js"]
EOF

    print_success "SFU server setup completed"
}

# Build Docker images
build_images() {
    print_status "Building Docker images..."
    
    # Build server image
    docker build -t livestream-server:latest -f server/Dockerfile server/
    
    # Build client image
    docker build -t livestream-client:latest -f client/Dockerfile client/
    
    # Build SFU image
    docker build -t livestream-sfu:latest sfu/
    
    print_success "Docker images built successfully"
}

# Start the services
start_services() {
    print_status "Starting services..."
    
    # Start infrastructure services first
    docker-compose up -d redis-cluster-1 redis-cluster-2 redis-cluster-3
    docker-compose up -d mongodb-primary mongodb-secondary
    docker-compose up -d zookeeper kafka
    
    print_status "Waiting for infrastructure services to be ready..."
    sleep 30
    
    # Initialize Redis cluster
    print_status "Initializing Redis cluster..."
    docker exec redis-cluster-1 redis-cli --cluster create \
        redis-cluster-1:6379 redis-cluster-2:6380 redis-cluster-3:6381 \
        --cluster-replicas 0 --cluster-yes || true
    
    # Start application services
    docker-compose up -d sfu-server-1 sfu-server-2
    docker-compose up -d websocket-server-1 websocket-server-2
    docker-compose up -d api-server-1 api-server-2
    docker-compose up -d load-balancer
    docker-compose up -d client
    
    # Start monitoring services
    docker-compose up -d prometheus grafana
    
    print_success "All services started successfully"
}

# Show service status
show_status() {
    print_status "Service Status:"
    docker-compose ps
    
    echo ""
    print_status "Service URLs:"
    echo "🌐 Client Application: http://localhost:3000"
    echo "⚖️  Load Balancer Stats: http://localhost:8080/stats"
    echo "📊 Prometheus: http://localhost:9090"
    echo "📈 Grafana: http://localhost:3001 (admin/admin123)"
    echo "🔧 API Health: http://localhost:5000/api/health"
    
    echo ""
    print_success "Setup completed! Your scalable live streaming server is ready."
    echo "🎯 Target: 1000+ concurrent users per room without lag"
}

# Performance test setup
setup_performance_test() {
    print_status "Setting up performance testing..."
    
    # Install Artillery for load testing
    cat > package.json << 'EOF'
{
  "name": "livestream-loadtest",
  "version": "1.0.0",
  "scripts": {
    "test:load": "artillery run loadtest.yml",
    "test:stress": "artillery run stresstest.yml"
  },
  "devDependencies": {
    "artillery": "^2.0.0"
  }
}
EOF

    # Create load test configuration
    cat > loadtest.yml << 'EOF'
config:
  target: 'ws://localhost:4000'
  phases:
    - duration: 60
      arrivalRate: 10
      rampTo: 100
    - duration: 300
      arrivalRate: 100
    - duration: 60
      arrivalRate: 100
      rampTo: 1000

scenarios:
  - name: "Join room as viewer"
    engine: ws
    weight: 80
    flow:
      - connect:
          url: "/socket.io/?EIO=4&transport=websocket"
      - emit:
          channel: "join-room"
          data:
            roomId: "loadtest-room"
            username: "user-{{ $uuid }}"
            isStreamer: false
      - think: 5
      - loop:
          - emit:
              channel: "chat-message"
              data:
                roomId: "loadtest-room"
                message: "Test message {{ $randomString() }}"
          - think: 10
        count: 10

  - name: "Join room as streamer"
    engine: ws
    weight: 20
    flow:
      - connect:
          url: "/socket.io/?EIO=4&transport=websocket"
      - emit:
          channel: "join-room"
          data:
            roomId: "loadtest-room-{{ $uuid }}"
            username: "streamer-{{ $uuid }}"
            isStreamer: true
      - think: 30
EOF

    npm install

    print_success "Performance testing setup completed"
    print_status "Run 'npm run test:load' to start load testing"
}

# Cleanup function
cleanup() {
    print_status "Cleaning up..."
    docker-compose down -v
    docker system prune -f
    print_success "Cleanup completed"
}

# Main execution
main() {
    case "${1:-setup}" in
        "setup")
            check_docker
            create_directories
            install_dependencies
            setup_monitoring
            setup_mongodb
            setup_sfu
            build_images
            start_services
            show_status
            setup_performance_test
            ;;
        "start")
            start_services
            show_status
            ;;
        "stop")
            docker-compose down
            print_success "Services stopped"
            ;;
        "restart")
            docker-compose restart
            print_success "Services restarted"
            ;;
        "logs")
            docker-compose logs -f "${2:-websocket-server-1}"
            ;;
        "status")
            show_status
            ;;
        "test")
            npm run test:load
            ;;
        "cleanup")
            cleanup
            ;;
        *)
            echo "Usage: $0 {setup|start|stop|restart|logs|status|test|cleanup}"
            echo ""
            echo "Commands:"
            echo "  setup   - Complete setup and start all services"
            echo "  start   - Start all services"
            echo "  stop    - Stop all services"
            echo "  restart - Restart all services"
            echo "  logs    - Show logs for a service (default: websocket-server-1)"
            echo "  status  - Show service status and URLs"
            echo "  test    - Run load test"
            echo "  cleanup - Stop services and clean up"
            exit 1
            ;;
    esac
}

main "$@"