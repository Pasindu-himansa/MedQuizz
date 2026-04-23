import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { GiBrain } from "react-icons/gi";
import { FilePlusCorner } from "lucide-react";

const emptyQuestion = {
  question: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  option_e: "",
  stem: "",
  statement_a: "",
  statement_b: "",
  statement_c: "",
  statement_d: "",
  statement_e: "",
};

export default function CustomSession() {
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState({ ...emptyQuestion });
  const [mode, setMode] = useState("sba");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleChange = (field, value) => {
    setCurrent((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddQuestion = () => {
    if (mode === "sba") {
      if (!current.question.trim())
        return setError("Please enter the question");
      if (
        !current.option_a ||
        !current.option_b ||
        !current.option_c ||
        !current.option_d ||
        !current.option_e
      )
        return setError("Please fill all 5 options");
    }
    if (mode === "tf") {
      if (!current.stem.trim())
        return setError("Please enter the question stem");
      if (
        !current.statement_a ||
        !current.statement_b ||
        !current.statement_c ||
        !current.statement_d ||
        !current.statement_e
      )
        return setError("Please fill all 5 statements");
    }
    setError("");
    setQuestions((prev) => [
      ...prev,
      { ...current, mode, id: prev.length + 1 },
    ]);
    setCurrent({ ...emptyQuestion });
  };

  const handleRemoveQuestion = (index) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartSession = async () => {
    if (questions.length === 0)
      return setError("Please add at least one question");
    setLoading(true);
    setError("");
    try {
      const res = await API.post("/session/custom", { questions, mode });
      navigate(`/waiting/${res.data.room_code}`);
    } catch (err) {
      setError("Failed to create session");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="glass-card p-4 mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              Custom Session <FilePlusCorner size={20} />
            </h1>
            <p className="text-white/50 text-sm">
              Add past paper questions — AI reveals answers
            </p>
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="text-white/50 hover:text-white text-sm font-medium transition"
          >
            ← Back
          </button>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {/* Mode Selector */}
        <div className="glass-card p-6 mb-4">
          <h2 className="font-bold text-white mb-3">Question Mode</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: "sba", l: "SBA", d: "Select Best Answer" },
              { v: "tf", l: "T/F", d: "True / False" },
            ].map((m) => (
              <button
                key={m.v}
                onClick={() => {
                  setMode(m.v);
                  setCurrent({ ...emptyQuestion });
                }}
                className={`p-4 rounded-xl border text-left transition ${
                  mode === m.v
                    ? "border-indigo-400/50 bg-indigo-500/30"
                    : "border-white/20 hover:border-white/40"
                }`}
              >
                <div className="font-bold text-white">{m.l}</div>
                <div className="text-xs text-white/50 mt-1">{m.d}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Add Question Form */}
        <div className="glass-card p-6 mb-4">
          <h2 className="font-bold text-white mb-4">
            Question {questions.length + 1}
          </h2>

          {/* SBA Form */}
          {mode === "sba" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Question
                </label>
                <textarea
                  value={current.question}
                  onChange={(e) => handleChange("question", e.target.value)}
                  className="glass-input w-full rounded-lg px-4 py-3 resize-none"
                  rows={3}
                  placeholder="Type the question here..."
                />
              </div>
              {["a", "b", "c", "d", "e"].map((opt) => (
                <div key={opt}>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Option {opt.toUpperCase()}
                  </label>
                  <input
                    type="text"
                    value={current[`option_${opt}`]}
                    onChange={(e) =>
                      handleChange(`option_${opt}`, e.target.value)
                    }
                    className="glass-input w-full rounded-lg px-4 py-2"
                    placeholder={`Option ${opt.toUpperCase()}...`}
                  />
                </div>
              ))}
              <div className="bg-indigo-500/20 border border-indigo-400/30 rounded-xl p-3 text-sm text-indigo-200 flex items-center gap-2">
                <GiBrain size={20} /> AI will reveal the correct answer during
                the session
              </div>
            </div>
          )}

          {/* T/F Form */}
          {mode === "tf" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Question Stem
                </label>
                <textarea
                  value={current.stem}
                  onChange={(e) => handleChange("stem", e.target.value)}
                  className="glass-input w-full rounded-lg px-4 py-3 resize-none"
                  rows={2}
                  placeholder="Type your question here..."
                />
              </div>
              {["a", "b", "c", "d", "e"].map((opt) => (
                <div key={opt}>
                  <label className="block text-sm font-medium text-white/70 mb-1">
                    Statement {opt.toUpperCase()}
                  </label>
                  <input
                    type="text"
                    value={current[`statement_${opt}`]}
                    onChange={(e) =>
                      handleChange(`statement_${opt}`, e.target.value)
                    }
                    className="glass-input w-full rounded-lg px-4 py-2"
                    placeholder={`Statement ${opt.toUpperCase()}...`}
                  />
                </div>
              ))}
              <div className="bg-indigo-500/20 border border-indigo-400/30 rounded-xl p-3 text-sm text-indigo-200 flex items-center gap-2">
                <GiBrain size={20} /> AI will determine True/False for each
                statement during the session
              </div>
            </div>
          )}

          <button
            onClick={handleAddQuestion}
            className="glass-btn w-full text-white py-3 rounded-xl font-semibold mt-4"
          >
            + Add Question
          </button>
        </div>

        {/* Added Questions */}
        {questions.length > 0 && (
          <div className="glass-card p-6 mb-4">
            <h2 className="font-bold text-white mb-3">
              Added Questions ({questions.length})
            </h2>
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white/10 rounded-xl px-4 py-3 border border-white/10"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full font-medium mr-2 border border-indigo-400/30">
                      {q.mode.toUpperCase()}
                    </span>
                    <span className="text-sm text-white/70">
                      Q{i + 1}:{" "}
                      {(q.mode === "sba" ? q.question : q.stem).substring(
                        0,
                        60,
                      )}
                      ...
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveQuestion(i)}
                    className="text-red-400/70 hover:text-red-300 ml-3 flex-shrink-0 transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Start Button */}
        {questions.length > 0 && (
          <button
            onClick={handleStartSession}
            disabled={loading}
            className="glass-btn-green w-full text-white py-4 rounded-2xl font-bold text-lg disabled:opacity-50 mb-8"
          >
            {loading
              ? "Creating session..."
              : `🚀 Start Session (${questions.length} question${questions.length > 1 ? "s" : ""})`}
          </button>
        )}
      </div>
    </div>
  );
}
