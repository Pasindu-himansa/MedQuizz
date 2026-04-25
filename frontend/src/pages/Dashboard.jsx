import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { CirclePlus, UsersRound, FilePlusCorner } from "lucide-react";
import { GiHealthNormal } from "react-icons/gi";

export default function Dashboard() {
  const [roomCode, setRoomCode] = useState("");
  const [subject, setSubject] = useState("General Medicine");
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState("final_year");
  const [mode, setMode] = useState("sba");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const name = localStorage.getItem("name");

  const subjects = [
    "General Medicine",
    "Surgery",
    "Pediatrics",
    "Psychiatry",
    "Cardiology",
    "Respiratory Medicine",
    "Gastroenterology",
    "Neurology",
    "Nephrology",
    "Endocrinology",
    "Haematology",
    "Oncology",
    "Rheumatology",
    "Dermatology",
    "Gyn & Obs",
    "Pharmacology",
    "Anatomy",
    "Physiology",
    "Pathology",
    "Microbiology",
    "Biochemistry",
    "Forensic Medicine",
    "Parasitology",
    "Toxicology",
    "Community Medicine",
    "Family Medicine",
  ];

  const difficulties = [
    { value: "easy", label: "Easy", color: "text-green-500" },
    { value: "medium", label: "Medium", color: "text-yellow-400" },
    { value: "hard", label: "Hard", color: "text-orange-500" },
    { value: "Pro", label: "Pro", color: "text-red-500" },
  ];

  const handleCreate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await API.post("/session/create", {
        subject,
        difficulty,
        num_questions: numQuestions,
        mode,
      });
      navigate(`/waiting/${res.data.room_code}`);
    } catch (err) {
      setError("Failed to create session");
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!roomCode.trim()) return setError("Please enter a room code");
    setLoading(true);
    setError("");
    try {
      await API.post(`/session/join/${roomCode.toUpperCase()}`);
      navigate(`/waiting/${roomCode.toUpperCase()}`);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to join session");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-4 mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-blue-400 flex items-center gap-2">
              MedQuizz <GiHealthNormal size={20} color="blue" />
            </h1>
            <p className="text-white/60 text-sm">Welcome, {name}!</p>
          </div>
          <button
            onClick={() => {
              localStorage.clear();
              navigate("/login");
            }}
            className="text-white/50 hover:text-red-300 text-sm font-medium transition"
          >
            Logout
          </button>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {/* Join Session */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-6 mb-4">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-4">
            <UsersRound size={20} /> Join a Session
          </h2>
          <p className="text-white/50 text-sm mb-4">Enter the room code</p>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            className="w-full bg-white/10 backdrop-blur-sm border border-white/25 text-white rounded-lg px-4 py-3 text-center text-2xl font-bold tracking-widest mb-4 outline-none focus:border-white/50 placeholder-white/40"
            placeholder="ABC123"
            maxLength={6}
          />
          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full bg-green-600/70 backdrop-blur-sm border border-white/20 text-white py-3 rounded-lg font-semibold hover:bg-green-600/90 transition disabled:opacity-50"
          >
            {loading ? "Joining..." : "Join Session"}
          </button>
        </div>

        {/* Create Session */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-6 mb-4">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-3">
            <CirclePlus size={20} /> Create a Session
          </h2>
          <p className="text-white/50 text-sm mb-4">
            Start a new study session with AI
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Subject
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-white/10 backdrop-blur-sm border border-white/25 text-white rounded-lg px-4 py-3 outline-none focus:border-white/50"
              >
                {subjects.map((s) => (
                  <option key={s} value={s} className="bg-gray-900">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Difficulty
              </label>
              <div className="grid grid-cols-4 gap-2">
                {difficulties.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDifficulty(d.value)}
                    className={`py-2 rounded-lg text-sm font-semibold border transition ${
                      difficulty === d.value
                        ? `bg-indigo-500/50 border-indigo-400/50 ${d.color}`
                        : `border-white/20 ${d.color} opacity-70 hover:opacity-100 hover:border-white/40`
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: "sba", l: "SBA", d: "Select Best Answer" },
                  { v: "tf", l: "T/F", d: "True / False" },
                ].map((m) => (
                  <button
                    key={m.v}
                    onClick={() => setMode(m.v)}
                    className={`p-3 rounded-xl border text-left transition backdrop-blur-sm ${
                      mode === m.v
                        ? "border-indigo-400/50 bg-indigo-500/30"
                        : "border-white/20 hover:border-white/40"
                    }`}
                  >
                    <div className="font-bold text-white">{m.l}</div>
                    <div className="text-xs text-white/50">{m.d}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Questions
              </label>
              <select
                value={numQuestions}
                onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                className="w-full bg-white/10 backdrop-blur-sm border border-white/25 text-white rounded-lg px-4 py-3 outline-none focus:border-white/50"
              >
                {[5, 10, 15, 20, 30].map((n) => (
                  <option key={n} value={n} className="bg-gray-900">
                    {n} Questions
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full bg-indigo-500/70 backdrop-blur-sm border border-white/20 text-white py-3 rounded-lg font-semibold hover:bg-indigo-500/90 transition disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Session"}
            </button>
          </div>
        </div>

        {/* Custom Session */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-6 mb-4">
          <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-3">
            <FilePlusCorner size={20} /> Custom Session
          </h2>
          <p className="text-white/50 text-sm mb-4">Add your own questions</p>
          <button
            onClick={() => navigate("/custom")}
            className="w-full bg-purple-600/70 backdrop-blur-sm border border-white/20 text-white py-3 rounded-lg font-semibold hover:bg-purple-600/90 transition"
          >
            Create Custom Session
          </button>
        </div>
      </div>
    </div>
  );
}
