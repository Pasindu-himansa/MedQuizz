import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../api";
import { ArrowLeft, LoaderCircle, MailCheck } from "lucide-react";

const RESEND_SECONDS = 60;

export default function ForgotPassword() {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    setLoading(true);
    setError("");
    try {
      await API.post("/auth/password/request-otp", { email });
      setStep("reset");
      setOtp("");
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not send the code");
    }
    setLoading(false);
  };

  const handleSendCode = (e) => {
    e.preventDefault();
    sendCode();
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (password.length < 6)
      return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("Passwords do not match");
    setLoading(true);
    setError("");
    try {
      await API.post("/auth/password/reset", {
        email,
        otp,
        new_password: password,
      });
      navigate("/login", {
        state: { notice: "Password reset. You can now log in." },
      });
    } catch (err) {
      setError(err.response?.data?.detail || "Could not reset password");
    }
    setLoading(false);
  };

  const inputClass =
    "w-full bg-white/10 backdrop-blur-sm border border-white/25 text-white rounded-lg px-4 py-3 outline-none focus:border-white/50 placeholder-white/40";
  const buttonClass =
    "w-full flex items-center justify-center gap-2 bg-indigo-500/70 backdrop-blur-sm border border-white/20 text-white py-3 rounded-lg font-semibold hover:bg-indigo-500/90 transition disabled:opacity-50";

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">MedQuizz</h1>
          <p className="text-white/60 mt-2">Reset your password</p>
        </div>

        {step === "email" && (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="your@email.com"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className={buttonClass}>
              {loading && <LoaderCircle size={18} className="animate-spin" />}
              {loading ? "Sending code..." : "Send reset code"}
            </button>
          </form>
        )}

        {step === "reset" && (
          <form onSubmit={handleReset} className="space-y-4">
            <div className="bg-indigo-500/20 border border-indigo-400/30 rounded-xl p-3 text-sm text-indigo-100 flex items-start gap-2">
              <MailCheck size={18} className="flex-shrink-0 mt-0.5" />
              <span>
                If an account exists for <strong>{email}</strong>, we sent it a
                6-digit code. Check your inbox (and spam folder).
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Reset code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className={`${inputClass} text-center text-2xl tracking-[0.5em] font-bold`}
                placeholder="000000"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
                placeholder="Repeat the new password"
                autoComplete="new-password"
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
              disabled={loading || otp.length !== 6}
              className={buttonClass}
            >
              {loading && <LoaderCircle size={18} className="animate-spin" />}
              {loading ? "Resetting..." : "Reset Password"}
            </button>

            <div className="flex justify-between items-center text-sm">
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setError("");
                }}
                className="flex items-center gap-1 text-white/50 hover:text-white transition"
              >
                <ArrowLeft size={14} /> Change email
              </button>
              <button
                type="button"
                onClick={sendCode}
                disabled={cooldown > 0 || loading}
                className="text-indigo-300 font-semibold hover:text-indigo-200 disabled:text-white/30 transition"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}

        <p className="text-center text-white/50 mt-6">
          Remembered it?{" "}
          <Link
            to="/login"
            className="text-indigo-300 font-semibold hover:text-indigo-200"
          >
            Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}
