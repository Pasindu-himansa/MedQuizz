import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../api";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    batch: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await API.post("/register", form);
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("name", res.data.name);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Registration failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white">MedQuizz</h1>
          <p className="text-white/60 mt-2">Create your account</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          {["name", "email", "password", "university"].map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium text-white/80 mb-1 capitalize">
                {field === "university"
                  ? "Batch"
                  : field.charAt(0).toUpperCase() + field.slice(1)}
              </label>
              <input
                type={
                  field === "password"
                    ? "password"
                    : field === "email"
                      ? "email"
                      : "text"
                }
                name={field}
                value={form[field]}
                onChange={handleChange}
                className="glass-input w-full rounded-lg px-4 py-3"
                placeholder={
                  field === "name"
                    ? "Your Name Here"
                    : field === "email"
                      ? "your@email.com"
                      : field === "password"
                        ? "••••••••"
                        : "Your Batch"
                }
                required
              />
            </div>
          ))}

          {error && (
            <div className="bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="glass-btn w-full text-white py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-white/50 mt-6">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-indigo-300 font-semibold hover:text-indigo-200"
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
