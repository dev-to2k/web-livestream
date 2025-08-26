// Network diagnostic utilities for troubleshooting connection issues
export const NetworkDiagnostics = {
  /**
   * Check if the server is reachable
   */
  async checkServerHealth(serverUrl = "http://localhost:5000") {
    try {
      const response = await fetch(`${serverUrl}/health`, {
        method: "GET",
        timeout: 5000,
      });
      return {
        isReachable: response.ok,
        status: response.status,
        message: response.ok
          ? "Server is running"
          : "Server responded with error",
      };
    } catch (error) {
      return {
        isReachable: false,
        status: null,
        message: this.getErrorMessage(error),
        error: error.message,
      };
    }
  },

  /**
   * Get user-friendly error message based on error type
   */
  getErrorMessage(error) {
    if (
      error.name === "TypeError" &&
      error.message.includes("Failed to fetch")
    ) {
      return "Không thể kết nối đến server. Server có thể chưa chạy hoặc bị chặn.";
    }

    if (
      error.code === "ECONNREFUSED" ||
      error.message.includes("ERR_CONNECTION_REFUSED")
    ) {
      return "Server từ chối kết nối. Vui lòng kiểm tra server có đang chạy không.";
    }

    if (error.message.includes("xhr poll error")) {
      return "Lỗi polling WebSocket. Có thể do vấn đề mạng hoặc cấu hình proxy.";
    }

    if (error.message.includes("timeout")) {
      return "Kết nối quá thời gian chờ. Kiểm tra tốc độ mạng và server.";
    }

    return error.message || "Lỗi kết nối không xác định";
  },

  /**
   * Get troubleshooting steps based on error
   */
  getTroubleshootingSteps(error) {
    const steps = [];

    if (
      error.message?.includes("ERR_CONNECTION_REFUSED") ||
      error.code === "ECONNREFUSED"
    ) {
      steps.push(
        "Kiểm tra server backend có đang chạy không:",
        "1. Mở terminal/command prompt",
        "2. Chạy lệnh: npm run server",
        "3. Đảm bảo server chạy trên port 5000"
      );
    }

    if (error.message?.includes("xhr poll error")) {
      steps.push(
        "Khắc phục lỗi polling:",
        "1. Kiểm tra kết nối mạng",
        "2. Tắt proxy hoặc VPN nếu có",
        "3. Thử refresh lại trang",
        "4. Kiểm tra tường lửa có chặn port 5000 không"
      );
    }

    if (steps.length === 0) {
      steps.push(
        "Các bước khắc phục chung:",
        "1. Khởi động lại server: npm run server",
        "2. Khởi động lại client: npm run client",
        "3. Kiểm tra ports 3000 và 5000 có bị chiếm không",
        "4. Thử chạy: npm run dev để khởi động đồng thời"
      );
    }

    return steps;
  },

  /**
   * Check if port is available
   */
  async checkPort(port, host = "localhost") {
    try {
      const response = await fetch(`http://${host}:${port}`, {
        method: "HEAD",
        timeout: 3000,
      });
      return {
        isAvailable: false, // Port is in use
        isResponding: response.ok,
      };
    } catch (error) {
      // If fetch fails, port might be available or server not responding
      return {
        isAvailable: true, // Port seems available
        isResponding: false,
        error: error.message,
      };
    }
  },

  /**
   * Run comprehensive network diagnostics
   */
  async runDiagnostics() {
    console.log("🔍 Running network diagnostics...");

    const results = {
      timestamp: new Date().toISOString(),
      serverHealth: await this.checkServerHealth(),
      ports: {
        server: await this.checkPort(5000),
        client: await this.checkPort(3000),
      },
    };

    console.log("📊 Diagnostic Results:", results);
    return results;
  },
};

// Auto-run diagnostics when there are connection issues
if (typeof window !== "undefined") {
  window.NetworkDiagnostics = NetworkDiagnostics;

  // Add global error listener for network issues
  window.addEventListener("unhandledrejection", (event) => {
    if (
      event.reason?.message?.includes("ERR_CONNECTION_REFUSED") ||
      event.reason?.message?.includes("xhr poll error")
    ) {
      console.warn("🔍 Network error detected, running diagnostics...");
      NetworkDiagnostics.runDiagnostics();
    }
  });
}

export default NetworkDiagnostics;
