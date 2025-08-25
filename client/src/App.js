import React, { useEffect, useState } from "react";
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import "./App.css";
import Home from "./components/Home/Home";
import QuickJoin from "./components/QuickJoin/QuickJoin";
import StreamRoom from "./components/StreamRoom/StreamRoom";
import { storage, STORAGE_KEYS } from "./utils/storage";

function App() {
  const [username, setUsername] = useState(
    storage.get(STORAGE_KEYS.USERNAME, "")
  );

  useEffect(() => {
    if (username) {
      storage.set(STORAGE_KEYS.USERNAME, username);
    }
  }, [username]);

  return (
    <Router>
      <div className="App">
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
      </div>
    </Router>
  );
}

export default App;
