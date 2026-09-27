import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import API from "../api";
import { Brain, CircleCheck, CircleAlert } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const notice = location.state?.notice;
  const deactivated = new URLSearchParams(location.search).has("deactivated");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await API.post("/login", { email, password });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("name", res.data.name);
      navigate("/dashboard");
    } catch (err) {
      setError(
        err.response?.status === 403
          ? err.response.data.detail
          : "Invalid email or password",
      );
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-8 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">MedQuizz</h1>
          <p className="text-white/60 mt-2 flex items-center justify-center gap-2">
            Powered with AI <Brain size={16} />
          </p>
        </div>

        {notice && (
          <div className="flex items-center gap-2 bg-green-500/20 border border-green-400/30 text-green-200 px-4 py-3 rounded-lg text-sm mb-4">
            <CircleCheck size={16} /> {notice}
          </div>
        )}

        {deactivated && !error && (
          <div className="flex items-center gap-2 bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-lg text-sm mb-4">
            <CircleAlert size={16} /> This account has been deactivated.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/10 backdrop-blur-sm border border-white/25 text-white rounded-lg px-4 py-3 outline-none focus:border-white/50 placeholder-white/40"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-white/80">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs text-indigo-300 hover:text-indigo-200 font-medium"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/10 backdrop-blur-sm border border-white/25 text-white rounded-lg px-4 py-3 outline-none focus:border-white/50 placeholder-white/40"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-500/70 backdrop-blur-sm border border-white/20 text-white py-3 rounded-lg font-semibold hover:bg-indigo-500/90 transition disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="text-center text-white/50 mt-6">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-indigo-300 font-semibold hover:text-indigo-200"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
