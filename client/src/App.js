import { useEffect, useState } from "react";
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import styles from "./App.module.css";
import Home from "./components/Home/Home";
import QuickJoin from "./components/QuickJoin/QuickJoin";
import StreamRoom from "./components/StreamRoom/StreamRoom";
import { ToastContainer } from "./components/UI/Toast";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import "./styles/globals.css";
import NetworkDiagnostics from "./utils/networkDiagnostics";
import { storage, STORAGE_KEYS } from "./utils/storage";

// App content component to use toast context
function AppContent() {
  const [username, setUsername] = useState(
    storage.get(STORAGE_KEYS.USERNAME, "")
  );
  const { toasts, removeToast, showError } = useToast();

  useEffect(() => {
    if (username) {
      storage.set(STORAGE_KEYS.USERNAME, username);
    }
  }, [username]);

  // Global error handler
  useEffect(() => {
    const handleGlobalError = (event) => {
      console.error("Global error:", event.error);
      showError("Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.", {
        title: "Lỗi hệ thống",
        duration: 5000,
      });
    };

    const handleUnhandledRejection = async (event) => {
      console.error("Unhandled promise rejection:", event.reason);

      // Check if it's a network-related error
      const isNetworkError =
        event.reason?.message?.includes("ERR_CONNECTION_REFUSED") ||
        event.reason?.message?.includes("xhr poll error") ||
        event.reason?.message?.includes("Failed to fetch") ||
        event.reason?.code === "ECONNREFUSED";

      if (isNetworkError) {
        // Run network diagnostics for better error reporting
        try {
          await NetworkDiagnostics.runDiagnostics();
          const troubleshootingSteps =
            NetworkDiagnostics.getTroubleshootingSteps(event.reason);

          showError(
            `${NetworkDiagnostics.getErrorMessage(
              event.reason
            )}\n\n${troubleshootingSteps.slice(0, 3).join("\n")}`,
            {
              title: "Lỗi kết nối mạng",
              duration: 10000,
              actions: [
                {
                  label: "Tải lại",
                  style: "primary",
                  onClick: () => window.location.reload(),
                },
              ],
            }
          );
        } catch (diagError) {
          showError("Kết nối mạng gặp sự cố. Kiểm tra server và thử lại.", {
            title: "Lỗi kết nối",
            duration: 5000,
          });
        }
      } else {
        showError("Đã xảy ra lỗi kết nối. Vui lòng kiểm tra mạng và thử lại.", {
          title: "Lỗi kết nối",
          duration: 5000,
        });
      }
    };

    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection
      );
    };
  }, [showError]);

  return (
    <Router>
      <div className={styles.App}>
        <Routes>
          <Route
            path="/"
            element={<Home username={username} setUsername={setUsername} />}
          />
          <Route
            path="/room/:roomId"
            element={
              username ? (
                <StreamRoom username={username} />
              ) : (
                <QuickJoin setUsername={setUsername} />
              )
            }
          />
        </Routes>

        {/* Global Toast Container */}
        <ToastContainer toasts={toasts} onClose={removeToast} />
      </div>
    </Router>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
