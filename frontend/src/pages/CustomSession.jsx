import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import {
  FilePlusCorner,
  ArrowLeft,
  Brain,
  Plus,
  Play,
  Save,
  FolderOpen,
  Trash2,
  Pencil,
  X,
  LoaderCircle,
  CircleCheck,
  FilePlus,
} from "lucide-react";

const OPTION_KEYS = ["a", "b", "c", "d", "e"];

const emptyQuestion = {
  question: "",
  option_a: "",
  option_b: "",
  option_c: "",
  option_d: "",
  option_e: "",
  correct_answer: "",
  stem: "",
  statement_a: "",
  statement_b: "",
  statement_c: "",
  statement_d: "",
  statement_e: "",
  answer_a: null,
  answer_b: null,
  answer_c: null,
  answer_d: null,
  answer_e: null,
};

// Short summary of the answers the user set, e.g. "Answer: C" or "T F AI T F"
const answerSummary = (q) => {
  if (q.mode === "sba")
    return q.correct_answer
      ? `Answer: ${q.correct_answer.toUpperCase()}`
      : "AI decides";
  const marks = OPTION_KEYS.map((k) =>
    q[`answer_${k}`] === true ? "T" : q[`answer_${k}`] === false ? "F" : "AI",
  );
  return marks.every((m) => m === "AI") ? "AI decides" : marks.join(" ");
};

export default function CustomSession() {
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState({ ...emptyQuestion });
  const [editingIndex, setEditingIndex] = useState(null);
  const [mode, setMode] = useState("sba");
  const [name, setName] = useState("");
  const [savedId, setSavedId] = useState(null);
  const [savedSessions, setSavedSessions] = useState([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();

  const fetchSaved = async () => {
    try {
      const res = await API.get("/saved-sessions");
      setSavedSessions(res.data);
    } catch (err) {
      console.error(err);
      setError("Could not load saved sessions");
    }
    setSavedLoading(false);
  };

  useEffect(() => {
    fetchSaved();
  }, []);

  const showNotice = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 3000);
  };

  const handleChange = (field, value) => {
    setCurrent((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddQuestion = () => {
    if (mode === "sba") {
      if (!current.question.trim())
        return setError("Please enter the question");
      if (OPTION_KEYS.some((k) => !current[`option_${k}`]))
        return setError("Please fill all 5 options");
    }
    if (mode === "tf") {
      if (!current.stem.trim())
        return setError("Please enter the question stem");
      if (OPTION_KEYS.some((k) => !current[`statement_${k}`]))
        return setError("Please fill all 5 statements");
    }
    setError("");
    const q = { ...current, mode };
    if (editingIndex !== null) {
      setQuestions((prev) => prev.map((p, i) => (i === editingIndex ? q : p)));
      setEditingIndex(null);
    } else {
      setQuestions((prev) => [...prev, q]);
    }
    setCurrent({ ...emptyQuestion });
  };

  const handleEditQuestion = (index) => {
    setCurrent({ ...emptyQuestion, ...questions[index] });
    setEditingIndex(index);
    setError("");
  };

  const handleCancelEdit = () => {
    setCurrent({ ...emptyQuestion });
    setEditingIndex(null);
  };

  const handleRemoveQuestion = (index) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) handleCancelEdit();
    else if (editingIndex !== null && index < editingIndex)
      setEditingIndex(editingIndex - 1);
  };

  const handleNewSession = () => {
    if (
      questions.length > 0 &&
      !window.confirm("Clear the current questions and start a new session?")
    )
      return;
    setQuestions([]);
    setCurrent({ ...emptyQuestion });
    setEditingIndex(null);
    setName("");
    setSavedId(null);
    setError("");
  };

  const handleLoadSaved = (saved) => {
    if (
      questions.length > 0 &&
      savedId !== saved.id &&
      !window.confirm(`Replace the current questions with "${saved.name}"?`)
    )
      return;
    setMode(saved.mode);
    setQuestions(saved.questions);
    setName(saved.name);
    setSavedId(saved.id);
    setCurrent({ ...emptyQuestion });
    setEditingIndex(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteSaved = async (saved) => {
    if (!window.confirm(`Delete "${saved.name}"? This cannot be undone.`))
      return;
    try {
      await API.delete(`/saved-sessions/${saved.id}`);
      setSavedSessions((prev) => prev.filter((s) => s.id !== saved.id));
      if (savedId === saved.id) setSavedId(null);
    } catch (err) {
      console.error(err);
      setError("Failed to delete saved session");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return setError("Please give the session a name");
    if (questions.length === 0)
      return setError("Please add at least one question");
    setSaving(true);
    setError("");
    try {
      const payload = { name, mode, questions };
      const res = savedId
        ? await API.put(`/saved-sessions/${savedId}`, payload)
        : await API.post("/saved-sessions", payload);
      setSavedId(res.data.id);
      setName(res.data.name);
      await fetchSaved();
      showNotice(savedId ? "Changes saved" : "Session saved");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save session");
    }
    setSaving(false);
  };

  const handleStartSession = async () => {
    if (questions.length === 0)
      return setError("Please add at least one question");
    setLoading(true);
    setError("");
    try {
      const res = await API.post("/session/custom", {
        questions,
        mode,
        name: name.trim() || null,
      });
      navigate(`/waiting/${res.data.room_code}`);
    } catch (err) {
      setError("Failed to create session");
    }
    setLoading(false);
  };

  const inputClass =
    "w-full bg-white/10 backdrop-blur-sm border border-white/25 text-white rounded-lg px-4 py-2 outline-none focus:border-white/50 placeholder-white/40";
  const cardClass =
    "bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl";
  const toggleClass = (active, color = "indigo") =>
    `px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
      active
        ? color === "green"
          ? "bg-green-500/40 border-green-400/60 text-white"
          : color === "red"
            ? "bg-red-500/40 border-red-400/60 text-white"
            : "bg-indigo-500/40 border-indigo-400/60 text-white"
        : "border-white/20 text-white/50 hover:border-white/40 hover:text-white/80"
    }`;

  const formatDate = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div
          className={`${cardClass} p-4 mb-4 flex justify-between items-center`}
        >
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              Custom Session <FilePlusCorner size={20} />
            </h1>
            <p className="text-white/50 text-sm">
              Add your own questions and answers, save them for later
            </p>
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1 text-white/50 hover:text-white text-sm font-medium transition"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 bg-green-500/20 border border-green-400/30 text-green-200 px-4 py-3 rounded-lg text-sm mb-4">
            <CircleCheck size={16} /> {notice}
          </div>
        )}

        {/* Saved Sessions */}
        <div className={`${cardClass} p-6 mb-4`}>
          <h2 className="font-bold text-white mb-3 flex items-center gap-2">
            <FolderOpen size={18} /> Saved Sessions
          </h2>
          {savedLoading ? (
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <LoaderCircle size={16} className="animate-spin" /> Loading...
            </div>
          ) : savedSessions.length === 0 ? (
            <p className="text-white/50 text-sm">
              No saved sessions yet. Add questions below, give the session a
              name and save it to reuse later.
            </p>
          ) : (
            <div className="space-y-2">
              {savedSessions.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                    savedId === s.id
                      ? "bg-indigo-500/20 border-indigo-400/40"
                      : "bg-white/10 border-white/10"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold truncate">
                      {s.name}
                    </div>
                    <div className="text-xs text-white/50 mt-0.5">
                      {s.mode.toUpperCase()} · {s.num_questions} question
                      {s.num_questions !== 1 ? "s" : ""} ·{" "}
                      {formatDate(s.updated_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <button
                      onClick={() => handleLoadSaved(s)}
                      className="flex items-center gap-1 text-xs font-semibold text-white bg-indigo-500/50 hover:bg-indigo-500/80 border border-white/20 px-3 py-1.5 rounded-lg transition"
                    >
                      <FolderOpen size={14} /> Open
                    </button>
                    <button
                      onClick={() => handleDeleteSaved(s)}
                      className="text-red-400/70 hover:text-red-300 p-1.5 transition"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Session Name */}
        <div className={`${cardClass} p-6 mb-4`}>
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-white">
              {savedId ? "Editing Saved Session" : "Session Name"}
            </h2>
            {(savedId || questions.length > 0) && (
              <button
                onClick={handleNewSession}
                className="flex items-center gap-1 text-white/50 hover:text-white text-sm font-medium transition"
              >
                <FilePlus size={16} /> New
              </button>
            )}
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className={inputClass}
            placeholder="e.g. Cardiology revision - Week 3"
          />
        </div>

        {/* Mode Selector */}
        <div className={`${cardClass} p-6 mb-4`}>
          <h2 className="font-bold text-white mb-3">Question Mode</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: "sba", l: "SBA", d: "Select Best Answer" },
              { v: "tf", l: "T/F", d: "True / False" },
            ].map((m) => (
              <button
                key={m.v}
                disabled={questions.length > 0 && mode !== m.v}
                onClick={() => {
                  setMode(m.v);
                  setCurrent({ ...emptyQuestion });
                }}
                className={`p-4 rounded-xl border text-left transition backdrop-blur-sm disabled:opacity-40 disabled:cursor-not-allowed ${
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
          {questions.length > 0 && (
            <p className="text-xs text-white/40 mt-2">
              All questions in a session use the same mode. Remove the added
              questions to switch.
            </p>
          )}
        </div>

        {/* Add Question Form */}
        <div className={`${cardClass} p-6 mb-4`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-white">
              {editingIndex !== null
                ? `Editing Question ${editingIndex + 1}`
                : `Question ${questions.length + 1}`}
            </h2>
            {editingIndex !== null && (
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-1 text-white/50 hover:text-white text-sm font-medium transition"
              >
                <X size={16} /> Cancel
              </button>
            )}
          </div>

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
                  className={`${inputClass} resize-none`}
                  rows={3}
                  placeholder="Type the question here..."
                />
              </div>
              {OPTION_KEYS.map((opt) => (
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
                    className={inputClass}
                    placeholder={`Option ${opt.toUpperCase()}...`}
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Correct Answer
                </label>
                <div className="flex flex-wrap gap-2">
                  {OPTION_KEYS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleChange("correct_answer", opt)}
                      className={toggleClass(
                        current.correct_answer === opt,
                        "green",
                      )}
                    >
                      {opt.toUpperCase()}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleChange("correct_answer", "")}
                    className={`${toggleClass(!current.correct_answer)} flex items-center gap-1`}
                  >
                    <Brain size={14} /> Let AI decide
                  </button>
                </div>
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
                  className={`${inputClass} resize-none`}
                  rows={2}
                  placeholder="Type your question here..."
                />
              </div>
              {OPTION_KEYS.map((opt) => (
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
                    className={inputClass}
                    placeholder={`Statement ${opt.toUpperCase()}...`}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => handleChange(`answer_${opt}`, true)}
                      className={toggleClass(
                        current[`answer_${opt}`] === true,
                        "green",
                      )}
                    >
                      True
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChange(`answer_${opt}`, false)}
                      className={toggleClass(
                        current[`answer_${opt}`] === false,
                        "red",
                      )}
                    >
                      False
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChange(`answer_${opt}`, null)}
                      className={`${toggleClass(current[`answer_${opt}`] === null)} flex items-center gap-1`}
                    >
                      <Brain size={14} /> AI
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-indigo-500/20 border border-indigo-400/30 rounded-xl p-3 text-sm text-indigo-200 flex items-center gap-2 mt-4">
            <Brain size={20} className="flex-shrink-0" /> Answers you leave on
            AI will be decided by AI when revealed during the session
          </div>

          <button
            onClick={handleAddQuestion}
            className="w-full flex items-center justify-center gap-2 bg-indigo-500/70 backdrop-blur-sm border border-white/20 text-white py-3 rounded-xl font-semibold mt-4 hover:bg-indigo-500/90 transition"
          >
            {editingIndex !== null ? (
              <>
                <CircleCheck size={18} /> Update Question
              </>
            ) : (
              <>
                <Plus size={18} /> Add Question
              </>
            )}
          </button>
        </div>

        {/* Added Questions */}
        {questions.length > 0 && (
          <div className={`${cardClass} p-6 mb-4`}>
            <h2 className="font-bold text-white mb-3">
              Added Questions ({questions.length})
            </h2>
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                    editingIndex === i
                      ? "bg-indigo-500/20 border-indigo-400/40"
                      : "bg-white/10 border-white/10"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white/70 truncate">
                      <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full font-medium mr-2 border border-indigo-400/30">
                        {q.mode.toUpperCase()}
                      </span>
                      Q{i + 1}: {q.mode === "sba" ? q.question : q.stem}
                    </div>
                    <div className="text-xs text-white/40 mt-1">
                      {answerSummary(q)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                    <button
                      onClick={() => handleEditQuestion(i)}
                      className="text-white/50 hover:text-white p-1.5 transition"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleRemoveQuestion(i)}
                      className="text-red-400/70 hover:text-red-300 p-1.5 transition"
                      title="Remove"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save + Start Buttons */}
        {questions.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-indigo-500/60 backdrop-blur-sm border border-white/20 text-white py-4 rounded-2xl font-bold text-lg disabled:opacity-50 hover:bg-indigo-500/80 transition"
            >
              {saving ? (
                <LoaderCircle size={20} className="animate-spin" />
              ) : (
                <Save size={20} />
              )}
              {savedId ? "Save Changes" : "Save Session"}
            </button>
            <button
              onClick={handleStartSession}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-green-600/70 backdrop-blur-sm border border-white/20 text-white py-4 rounded-2xl font-bold text-lg disabled:opacity-50 hover:bg-green-600/90 transition"
            >
              {loading ? (
                <LoaderCircle size={20} className="animate-spin" />
              ) : (
                <Play size={20} />
              )}
              {loading
                ? "Creating..."
                : `Start (${questions.length} question${questions.length > 1 ? "s" : ""})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
