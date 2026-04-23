import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import WaitingRoom from "./pages/WaitingRoom";
import Session from "./pages/Session";
import CustomSession from "./pages/CustomSession";
import ScorePage from "./pages/ScorePage";

function PrivateRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/waiting/:roomCode"
          element={
            <PrivateRoute>
              <WaitingRoom />
            </PrivateRoute>
          }
        />
        <Route
          path="/session/:roomCode"
          element={
            <PrivateRoute>
              <Session />
            </PrivateRoute>
          }
        />
        <Route
          path="/custom"
          element={
            <PrivateRoute>
              <CustomSession />
            </PrivateRoute>
          }
        />
        <Route
          path="/score/:roomCode"
          element={
            <PrivateRoute>
              <ScorePage />
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
