import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import {
  ArrowLeft,
  CircleUserRound,
  Pencil,
  LoaderCircle,
  CircleCheck,
  CircleAlert,
  KeyRound,
  ChartColumn,
  BookOpen,
  History,
  Mail,
  GraduationCap,
} from "lucide-react";

const BAR_COLOR = "#6366f1"; // indigo-500, validated against the dark surface
const BAR_HOVER_COLOR = "#818cf8";
const CHART_SESSIONS = 20;
const HISTORY_PREVIEW = 10;

const cardClass =
  "bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl";
const inputClass =
  "w-full bg-white/10 backdrop-blur-sm border border-white/25 text-white rounded-lg px-4 py-2 outline-none focus:border-white/50 placeholder-white/40";

const modeLabel = (m) => (m === "tf" ? "T/F" : "SBA");
const difficultyLabel = (d) =>
  !d || d === "custom"
    ? null
    : d === "final_year"
      ? "Final year"
      : d.charAt(0).toUpperCase() + d.slice(1);
const formatDate = (iso, withTime = false) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
      })
    : "";
const pct = (v) => (v === null || v === undefined ? "–" : `${Math.round(v)}%`);

function StatTile({ label, value }) {
  return (
    <div className="bg-white/10 border border-white/15 rounded-xl p-4">
      <div className="text-xs text-white/50">{label}</div>
      <div className="text-2xl font-semibold text-white mt-1">{value}</div>
    </div>
  );
}

function ScoreChart({ results }) {
  const [hovered, setHovered] = useState(null);
  const data = results.slice(-CHART_SESSIONS);
  const last = data.length - 1;

  return (
    <div className="flex gap-2">
      {/* Y axis labels */}
      <div className="relative w-9 h-48 flex-shrink-0 text-xs text-white/40">
        {[100, 50, 0].map((t) => (
          <span
            key={t}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${100 - t}%` }}
          >
            {t}%
          </span>
        ))}
      </div>

      {/* Plot */}
      <div className="relative flex-1 h-48">
        {[100, 50, 0].map((t) => (
          <div
            key={t}
            className="absolute left-0 right-0 h-px bg-white/10"
            style={{ top: `${100 - t}%` }}
          />
        ))}

        <div className="absolute inset-0 flex items-end">
          {data.map((r, i) => {
            const active = hovered === i;
            return (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                aria-label={`${r.subject}, ${formatDate(r.date)}: ${r.earned} of ${r.total}, ${Math.round(r.percentage)}%`}
                className="relative flex-1 h-full flex items-end justify-center outline-none focus-visible:bg-white/5"
              >
                <div
                  className="w-full mx-px rounded-t"
                  style={{
                    maxWidth: 24,
                    height: r.percentage > 0 ? `${r.percentage}%` : 2,
                    background: active ? BAR_HOVER_COLOR : BAR_COLOR,
                    opacity: r.percentage > 0 ? 1 : 0.5,
                  }}
                />
                {i === last && hovered === null && (
                  <span
                    className="absolute text-xs font-semibold text-white"
                    style={{ bottom: `calc(${r.percentage}% + 4px)` }}
                  >
                    {Math.round(r.percentage)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {hovered !== null && (
          <div
            className="absolute z-10 -translate-x-1/2 pointer-events-none bg-gray-900/95 border border-white/20 rounded-lg px-3 py-2 text-xs text-white shadow-xl whitespace-nowrap"
            style={{
              left: `${((hovered + 0.5) / data.length) * 100}%`,
              bottom: `calc(${Math.max(data[hovered].percentage, 0)}% + 8px)`,
            }}
          >
            <div className="font-semibold">{data[hovered].subject}</div>
            <div className="text-white/60">
              {formatDate(data[hovered].date)} ·{" "}
              {modeLabel(data[hovered].mode)}
            </div>
            <div className="mt-1">
              {data[hovered].earned}/{data[hovered].total} ·{" "}
              <strong>{Math.round(data[hovered].percentage)}%</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Account() {
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({ name: "", university: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([API.get("/me"), API.get("/me/progress")])
      .then(([me, prog]) => {
        setUser(me.data);
        setProfile({ name: me.data.name, university: me.data.university || "" });
        setProgress(prog.data);
      })
      .catch((err) => {
        console.error(err);
        setError("Could not load your account");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await API.put("/me", profile);
      setUser(res.data);
      localStorage.setItem("name", res.data.name);
      setEditing(false);
      setProfileMsg({ ok: true, text: "Profile updated" });
    } catch (err) {
      setProfileMsg({
        ok: false,
        text: err.response?.data?.detail || "Could not update profile",
      });
    }
    setProfileSaving(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pw.next.length < 6)
      return setPwMsg({ ok: false, text: "New password must be at least 6 characters" });
    if (pw.next !== pw.confirm)
      return setPwMsg({ ok: false, text: "New passwords do not match" });
    setPwSaving(true);
    setPwMsg(null);
    try {
      await API.post("/me/password", {
        current_password: pw.current,
        new_password: pw.next,
      });
      setPw({ current: "", next: "", confirm: "" });
      setPwMsg({ ok: true, text: "Password changed" });
    } catch (err) {
      setPwMsg({
        ok: false,
        text: err.response?.data?.detail || "Could not change password",
      });
    }
    setPwSaving(false);
  };

  const Message = ({ msg }) =>
    msg ? (
      <div
        className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm mt-3 border ${
          msg.ok
            ? "bg-green-500/20 border-green-400/30 text-green-200"
            : "bg-red-500/20 border-red-400/30 text-red-200"
        }`}
      >
        {msg.ok ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
        {msg.text}
      </div>
    ) : null;

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-white font-semibold">
          <LoaderCircle size={20} className="animate-spin" /> Loading your
          account...
        </div>
      </div>
    );

  if (error || !user)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-red-300">
          <CircleAlert size={20} /> {error || "Could not load your account"}
        </div>
      </div>
    );

  const results = progress?.results || [];
  const history = [...results].reverse();
  const visibleHistory = showAllHistory
    ? history
    : history.slice(0, HISTORY_PREVIEW);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div
          className={`${cardClass} p-4 mb-4 flex justify-between items-center`}
        >
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            My Account <CircleUserRound size={22} />
          </h1>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1 text-white/50 hover:text-white text-sm font-medium transition"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>

        {/* Profile */}
        <div className={`${cardClass} p-6 mb-4`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-full bg-indigo-500/40 border border-indigo-300/40 flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-xl font-bold text-white truncate">
                  {user.name}
                </div>
                <div className="flex items-center gap-1 text-sm text-white/60 truncate">
                  <Mail size={14} className="flex-shrink-0" /> {user.email}
                </div>
                {user.university && (
                  <div className="flex items-center gap-1 text-sm text-white/60">
                    <GraduationCap size={14} /> {user.university}
                  </div>
                )}
              </div>
            </div>
            {!editing && (
              <button
                onClick={() => {
                  setEditing(true);
                  setProfileMsg(null);
                }}
                className="flex items-center gap-1 text-white/50 hover:text-white text-sm font-medium transition flex-shrink-0"
              >
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>

          {editing && (
            <form onSubmit={handleSaveProfile} className="space-y-3 mt-5">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Name
                </label>
                <input
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                  maxLength={100}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Batch
                </label>
                <input
                  value={profile.university}
                  onChange={(e) =>
                    setProfile({ ...profile, university: e.target.value })
                  }
                  maxLength={100}
                  className={inputClass}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="flex items-center gap-2 bg-indigo-500/70 border border-white/20 text-white px-5 py-2 rounded-lg font-semibold hover:bg-indigo-500/90 transition disabled:opacity-50"
                >
                  {profileSaving && (
                    <LoaderCircle size={16} className="animate-spin" />
                  )}
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setProfile({
                      name: user.name,
                      university: user.university || "",
                    });
                  }}
                  className="text-white/50 hover:text-white px-3 py-2 text-sm font-medium transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <Message msg={profileMsg} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatTile label="Sessions completed" value={progress.sessions_completed} />
          <StatTile label="Overall score" value={pct(progress.overall_percentage)} />
          <StatTile label="Best score" value={pct(progress.best_percentage)} />
          <StatTile label="Questions answered" value={progress.questions_answered} />
        </div>

        {/* Score chart */}
        <div className={`${cardClass} p-6 mb-4`}>
          <h2 className="font-bold text-white flex items-center gap-2">
            <ChartColumn size={18} /> Score per session
          </h2>
          <p className="text-xs text-white/50 mb-4">
            {results.length > 0
              ? `Your last ${Math.min(results.length, CHART_SESSIONS)} completed session${results.length === 1 ? "" : "s"}, oldest to newest`
              : "Joined " + progress.sessions_joined + " session" + (progress.sessions_joined === 1 ? "" : "s") + " so far"}
          </p>
          {results.length > 0 ? (
            <ScoreChart results={results} />
          ) : (
            <p className="text-sm text-white/60">
              Finish a session to start tracking your progress here.
            </p>
          )}
        </div>

        {/* By subject */}
        {progress.subjects.length > 0 && (
          <div className={`${cardClass} p-6 mb-4`}>
            <h2 className="font-bold text-white flex items-center gap-2 mb-4">
              <BookOpen size={18} /> By subject
            </h2>
            <div className="space-y-3">
              {progress.subjects.map((s) => (
                <div key={s.subject}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white font-medium truncate">
                      {s.subject}
                    </span>
                    <span className="text-white/60 flex-shrink-0 ml-3">
                      {s.sessions} session{s.sessions === 1 ? "" : "s"} ·{" "}
                      <span className="text-white font-semibold">
                        {Math.round(s.percentage)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-indigo-500/20 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${s.percentage}%`, background: BAR_COLOR }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className={`${cardClass} p-6 mb-4`}>
            <h2 className="font-bold text-white flex items-center gap-2 mb-4">
              <History size={18} /> Session history
            </h2>
            <div className="space-y-2">
              {visibleHistory.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white/10 rounded-xl px-4 py-3 border border-white/10"
                >
                  <div className="min-w-0">
                    <div className="text-white font-semibold truncate">
                      {r.subject}
                    </div>
                    <div className="text-xs text-white/50 mt-0.5">
                      {[modeLabel(r.mode), difficultyLabel(r.difficulty), formatDate(r.date, true)]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <div className="text-white font-semibold">
                      {Math.round(r.percentage)}%
                    </div>
                    <div className="text-xs text-white/50">
                      {r.earned}/{r.total}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {history.length > HISTORY_PREVIEW && (
              <button
                onClick={() => setShowAllHistory(!showAllHistory)}
                className="w-full text-center text-sm text-indigo-300 hover:text-indigo-200 font-medium mt-3"
              >
                {showAllHistory ? "Show less" : `Show all ${history.length}`}
              </button>
            )}
          </div>
        )}

        {/* Change password */}
        <div className={`${cardClass} p-6 mb-8`}>
          <h2 className="font-bold text-white flex items-center gap-2 mb-4">
            <KeyRound size={18} /> Change password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <input
              type="password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              className={inputClass}
              placeholder="Current password"
              autoComplete="current-password"
              required
            />
            <input
              type="password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              className={inputClass}
              placeholder="New password (at least 6 characters)"
              autoComplete="new-password"
              required
            />
            <input
              type="password"
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              className={inputClass}
              placeholder="Confirm new password"
              autoComplete="new-password"
              required
            />
            <button
              type="submit"
              disabled={pwSaving}
              className="flex items-center gap-2 bg-indigo-500/70 border border-white/20 text-white px-5 py-2 rounded-lg font-semibold hover:bg-indigo-500/90 transition disabled:opacity-50"
            >
              {pwSaving && <LoaderCircle size={16} className="animate-spin" />}
              Change password
            </button>
          </form>
          <Message msg={pwMsg} />
          <p className="text-xs text-white/40 mt-3">
            Forgot your current password? Log out and use "Forgot password?"
            on the login page.
          </p>
        </div>
      </div>
    </div>
  );
}
