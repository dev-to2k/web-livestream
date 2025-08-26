import { useEffect, useState } from "react";
import { useToast } from "../../contexts/ToastContext";
import NetworkDiagnostics from "../../utils/networkDiagnostics";
import styles from "./NetworkStatus.module.css";

const NetworkStatus = ({ socket, isConnected }) => {
  const [networkStatus, setNetworkStatus] = useState("checking");
  const [serverHealth, setServerHealth] = useState(null);
  const { showError, showSuccess } = useToast();

  // Check server health periodically
  useEffect(() => {
    let healthCheckInterval;

    const checkServerHealth = async () => {
      try {
        const health = await NetworkDiagnostics.checkServerHealth();
        setServerHealth(health);

        if (health.isReachable) {
          setNetworkStatus("healthy");
        } else {
          setNetworkStatus("unhealthy");
        }
      } catch (error) {
        console.error("Health check failed:", error);
        setNetworkStatus("error");
        setServerHealth({
          isReachable: false,
          message: "Health check failed",
          error: error.message,
        });
      }
    };

    // Initial check
    checkServerHealth();

    // Check every 30 seconds when disconnected, every 60 seconds when connected
    const interval = isConnected ? 60000 : 30000;
    healthCheckInterval = setInterval(checkServerHealth, interval);

    return () => {
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }
    };
  }, [isConnected]);

  // Handle connection status changes
  useEffect(() => {
    if (isConnected && networkStatus === "unhealthy") {
      setNetworkStatus("healthy");
    }
  }, [isConnected, networkStatus]);

  const getStatusIcon = () => {
    switch (networkStatus) {
      case "healthy":
        return "🟢";
      case "unhealthy":
        return "🔴";
      case "checking":
        return "🟡";
      default:
        return "⚠️";
    }
  };

  const getStatusText = () => {
    if (isConnected) {
      return "Đã kết nối";
    }

    switch (networkStatus) {
      case "healthy":
        return "Server sẵn sàng";
      case "unhealthy":
        return "Server không phản hồi";
      case "checking":
        return "Đang kiểm tra...";
      default:
        return "Lỗi kết nối";
    }
  };

  const handleRunDiagnostics = async () => {
    try {
      const results = await NetworkDiagnostics.runDiagnostics();

      if (results.serverHealth.isReachable) {
        showSuccess("Server hoạt động bình thường!", {
          title: "Chẩn đoán mạng",
          duration: 3000,
        });
      } else {
        const steps = NetworkDiagnostics.getTroubleshootingSteps(
          results.serverHealth
        );
        showError(`Server không phản hồi:\n${steps.slice(0, 3).join("\n")}`, {
          title: "Chẩn đoán mạng",
          duration: 8000,
        });
      }
    } catch (error) {
      showError("Không thể chạy chẩn đoán mạng", {
        title: "Lỗi chẩn đoán",
        duration: 3000,
      });
    }
  };

  return (
    <div className={styles.networkStatus}>
      <div className={styles.statusIndicator}>
        <span className={styles.statusIcon}>{getStatusIcon()}</span>
        <span className={styles.statusText}>{getStatusText()}</span>
      </div>

      {(!isConnected || networkStatus !== "healthy") && (
        <button
          className={styles.diagnosticsButton}
          onClick={handleRunDiagnostics}
          title="Chạy chẩn đoán mạng"
        >
          🔍 Chẩn đoán
        </button>
      )}

      {serverHealth && !serverHealth.isReachable && (
        <div className={styles.errorDetails}>
          <small>{serverHealth.message}</small>
        </div>
      )}
    </div>
  );
};

export default NetworkStatus;
