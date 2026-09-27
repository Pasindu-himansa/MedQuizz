import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import ColumnChart from "../components/ColumnChart";
import {
  ArrowLeft,
  ShieldCheck,
  Gauge,
  UsersRound,
  FolderOpen,
  LoaderCircle,
  CircleAlert,
  CircleCheck,
  TriangleAlert,
  Search,
  Trash2,
  UserX,
  UserCheck,
  RefreshCw,
  Cpu,
} from "lucide-react";

const cardClass =
  "bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl";
const inputClass =
  "w-full bg-white/10 backdrop-blur-sm border border-white/25 text-white rounded-lg px-4 py-2 outline-none focus:border-white/50 placeholder-white/40";

const FEATURE_LABELS = {
  question_sba: "SBA question generation",
  question_tf: "T/F question generation",
  explain_sba: "SBA explanations",
  explain_tf: "T/F explanations",
  answer_sba: "Custom session SBA answers",
  answer_tf: "Custom session T/F answers",
};

const compact = (n) =>
  n === null || n === undefined
    ? "–"
    : new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n);
const full = (n) =>
  n === null || n === undefined ? "–" : new Intl.NumberFormat().format(n);
const formatDate = (iso, opts) =>
  iso ? new Date(iso).toLocaleString(undefined, opts) : "";
const formatTime = (iso) =>
  formatDate(iso, { hour: "numeric", minute: "2-digit" });

// Meter severity: the fill carries the state, always paired with an icon + label
const severity = (ratio) =>
  ratio >= 0.9
    ? { color: "#ef4444", track: "rgba(239,68,68,0.2)", label: "Almost out", Icon: CircleAlert, text: "text-red-300" }
    : ratio >= 0.75
      ? { color: "#f59e0b", track: "rgba(245,158,11,0.2)", label: "Getting close", Icon: TriangleAlert, text: "text-amber-300" }
      : { color: "#6366f1", track: "rgba(99,102,241,0.2)", label: "Plenty left", Icon: CircleCheck, text: "text-indigo-200" };

function Meter({ used, limit }) {
  const ratio = limit ? Math.min(used / limit, 1) : 0;
  const s = severity(ratio);
  return (
    <div>
      <div
        className="h-3 rounded-full overflow-hidden"
        style={{ background: s.track }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${ratio * 100}%`, background: s.color }}
        />
      </div>
      <div className={`flex items-center gap-1 text-xs font-semibold mt-2 ${s.text}`}>
        <s.Icon size={14} /> {s.label} · {Math.round(ratio * 100)}% used
      </div>
    </div>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <div className="bg-white/10 border border-white/15 rounded-xl p-4">
      <div className="text-xs text-white/50">{label}</div>
      <div className="text-2xl font-semibold text-white mt-1">{value}</div>
      {sub && <div className="text-xs text-white/40 mt-1">{sub}</div>}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-white/60 text-sm p-6">
      <LoaderCircle size={16} className="animate-spin" /> Loading...
    </div>
  );
}

function ErrorBox({ text }) {
  return (
    <div className="flex items-center gap-2 bg-red-500/20 border border-red-400/30 text-red-200 px-4 py-3 rounded-lg text-sm mb-4">
      <CircleAlert size={16} /> {text}
    </div>
  );
}

// ── Usage tab ──────────────────────────────────────────
function UsageTab() {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await API.get("/admin/usage");
      setUsage(res.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not load usage");
    }
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!usage) return error ? <ErrorBox text={error} /> : <Loading />;

  const { today, daily_token_limit: limit, groq_limits: groq } = usage;
  const chartMax = Math.max(limit, ...usage.daily.map((d) => d.tokens));
  const chartData = usage.daily.map((d) => ({ ...d, value: d.tokens }));

  return (
    <>
      {error && <ErrorBox text={error} />}

      {/* Token meter */}
      <div className={`${cardClass} p-6 mb-4`}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="font-bold text-white flex items-center gap-2">
              <Gauge size={18} /> AI tokens today
            </h2>
            <p className="text-xs text-white/50">
              {usage.model} · resets {formatTime(usage.resets_at)} your time
            </p>
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="flex items-center gap-1 text-white/50 hover:text-white text-sm font-medium transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />{" "}
            Refresh
          </button>
        </div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-4xl font-semibold text-white">
            {full(today.tokens)}
          </span>
          <span className="text-white/50">/ {full(limit)} tokens</span>
        </div>
        <Meter used={today.tokens} limit={limit} />
        <p className="text-sm text-white/70 mt-3">
          <strong className="text-white">{full(today.remaining)}</strong>{" "}
          tokens remaining today
        </p>
        <p className="text-xs text-white/40 mt-2">
          Counted from every AI call MedQuizz makes. Groq doesn't report its
          daily token limit directly, so this is an estimate against the{" "}
          {compact(limit)}/day free-tier limit.
        </p>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatTile label="AI calls today" value={full(today.calls)} />
        <StatTile label="Failed calls today" value={full(today.errors)} />
        <StatTile
          label="Requests left today"
          value={groq ? full(groq.requests_remaining_today) : "–"}
          sub={
            groq
              ? `of ${full(groq.requests_limit_per_day)} · from Groq, ${formatTime(groq.as_of)}`
              : "Shown after the next AI call"
          }
        />
        <StatTile
          label="Tokens left this minute"
          value={groq ? full(groq.tokens_remaining_this_minute) : "–"}
          sub={
            groq
              ? `of ${full(groq.tokens_limit_per_minute)} · from Groq, ${formatTime(groq.as_of)}`
              : "Shown after the next AI call"
          }
        />
      </div>

      {/* Daily chart */}
      <div className={`${cardClass} p-6 mb-4`}>
        <h2 className="font-bold text-white flex items-center gap-2">
          <Cpu size={18} /> Tokens per day
        </h2>
        <p className="text-xs text-white/50 mb-4">
          Last {usage.daily.length} days (UTC). The top line is the daily limit.
        </p>
        <ColumnChart
          data={chartData}
          max={chartMax}
          ticks={[chartMax, Math.round(chartMax / 2), 0]}
          formatTick={compact}
          capLabel={(d) => compact(d.value)}
          ariaLabel={(d) => `${d.date}: ${d.tokens} tokens, ${d.calls} calls`}
          renderTooltip={(d) => (
            <>
              <div className="font-semibold">
                {formatDate(d.date + "T00:00:00Z", {
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })}
              </div>
              <div className="mt-1">
                <strong>{full(d.tokens)}</strong> tokens
              </div>
              <div className="text-white/60">
                {d.calls} calls{d.errors ? ` · ${d.errors} failed` : ""}
              </div>
            </>
          )}
        />
        <p className="text-xs text-white/40 mt-4">
          All time: {full(usage.all_time.tokens)} tokens across{" "}
          {full(usage.all_time.calls)} calls
        </p>
      </div>

      {/* By feature */}
      <div className={`${cardClass} p-6 mb-8`}>
        <h2 className="font-bold text-white mb-4">Today by feature</h2>
        {usage.by_feature.length === 0 ? (
          <p className="text-sm text-white/60">No AI calls yet today.</p>
        ) : (
          <div className="space-y-3">
            {usage.by_feature.map((f) => (
              <div key={f.feature}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white font-medium truncate">
                    {FEATURE_LABELS[f.feature] || f.feature}
                  </span>
                  <span className="text-white/60 flex-shrink-0 ml-3">
                    {f.calls} calls
                    {f.errors ? ` (${f.errors} failed)` : ""} ·{" "}
                    <span className="text-white font-semibold">
                      {compact(f.tokens)}
                    </span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-indigo-500/20 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{
                      width: `${today.tokens ? (f.tokens / today.tokens) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Users tab ──────────────────────────────────────────
function UsersTab() {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (term) => {
    try {
      const res = await API.get("/admin/users", { params: { search: term } });
      setData(res.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not load users");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const toggleActive = async (u) => {
    const action = u.active ? "deactivate" : "activate";
    if (
      u.active &&
      !window.confirm(
        `Deactivate ${u.name} (${u.email})? They will be logged out and unable to log in until reactivated.`,
      )
    )
      return;
    setBusyId(u.id);
    try {
      await API.post(`/admin/users/${u.id}/${action}`);
      await load(search);
    } catch (err) {
      setError(err.response?.data?.detail || `Could not ${action} user`);
    }
    setBusyId(null);
  };

  if (!data) return error ? <ErrorBox text={error} /> : <Loading />;

  return (
    <>
      {error && <ErrorBox text={error} />}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatTile label="Total users" value={full(data.summary.total)} />
        <StatTile label="Active" value={full(data.summary.active)} />
        <StatTile label="Deactivated" value={full(data.summary.deactivated)} />
      </div>

      <div className={`${cardClass} p-6 mb-8`}>
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} pl-9`}
            placeholder="Search by name, email or batch"
          />
        </div>

        {data.users.length === 0 ? (
          <p className="text-sm text-white/60">No users found.</p>
        ) : (
          <div className="space-y-2">
            {data.users.map((u) => (
              <div
                key={u.id}
                className={`rounded-xl px-4 py-3 border ${
                  u.active
                    ? "bg-white/10 border-white/10"
                    : "bg-red-500/10 border-red-400/20"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold truncate">
                        {u.name}
                      </span>
                      {u.is_admin && (
                        <span className="flex items-center gap-1 text-xs bg-indigo-500/30 text-indigo-100 px-2 py-0.5 rounded-full border border-indigo-400/30">
                          <ShieldCheck size={12} /> Admin
                        </span>
                      )}
                      {!u.active && (
                        <span className="flex items-center gap-1 text-xs bg-red-500/30 text-red-100 px-2 py-0.5 rounded-full border border-red-400/30">
                          <UserX size={12} /> Deactivated
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-white/60 truncate">
                      {u.email}
                      {u.university ? ` · ${u.university}` : ""}
                    </div>
                    <div className="text-xs text-white/40 mt-1">
                      Joined {u.sessions_joined} · Hosted {u.sessions_hosted} ·
                      Completed {u.sessions_completed}
                      {u.overall_percentage !== null
                        ? ` · Overall ${Math.round(u.overall_percentage)}%`
                        : ""}{" "}
                      · Saved sets {u.saved_sessions}
                    </div>
                  </div>
                  {!u.is_admin && (
                    <button
                      onClick={() => toggleActive(u)}
                      disabled={busyId === u.id}
                      className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition flex-shrink-0 disabled:opacity-50 ${
                        u.active
                          ? "text-red-200 border-red-400/40 hover:bg-red-500/30"
                          : "text-green-200 border-green-400/40 hover:bg-green-500/30"
                      }`}
                    >
                      {busyId === u.id ? (
                        <LoaderCircle size={14} className="animate-spin" />
                      ) : u.active ? (
                        <UserX size={14} />
                      ) : (
                        <UserCheck size={14} />
                      )}
                      {u.active ? "Deactivate" : "Reactivate"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Saved sessions tab ─────────────────────────────────
function SavedSessionsTab() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    API.get("/admin/saved-sessions")
      .then((res) => setItems(res.data))
      .catch((err) =>
        setError(err.response?.data?.detail || "Could not load saved sessions"),
      );
  }, []);

  const handleDelete = async (s) => {
    if (
      !window.confirm(
        `Delete "${s.name}" by ${s.owner?.name || "unknown"}? This cannot be undone.`,
      )
    )
      return;
    setBusyId(s.id);
    try {
      await API.delete(`/admin/saved-sessions/${s.id}`);
      setItems((prev) => prev.filter((x) => x.id !== s.id));
    } catch (err) {
      setError(err.response?.data?.detail || "Could not delete saved session");
    }
    setBusyId(null);
  };

  if (!items) return error ? <ErrorBox text={error} /> : <Loading />;

  const term = filter.trim().toLowerCase();
  const visible = term
    ? items.filter((s) =>
        [s.name, s.owner?.name, s.owner?.email]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(term)),
      )
    : items;

  return (
    <>
      {error && <ErrorBox text={error} />}
      <div className={`${cardClass} p-6 mb-8`}>
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={`${inputClass} pl-9`}
            placeholder="Filter by session name or owner"
          />
        </div>
        <p className="text-xs text-white/50 mb-3">
          {visible.length} of {items.length} saved session
          {items.length === 1 ? "" : "s"}
        </p>
        {visible.length === 0 ? (
          <p className="text-sm text-white/60">No saved sessions found.</p>
        ) : (
          <div className="space-y-2">
            {visible.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-white/10 rounded-xl px-4 py-3 border border-white/10"
              >
                <div className="min-w-0">
                  <div className="text-white font-semibold truncate">
                    {s.name}
                  </div>
                  <div className="text-xs text-white/50 mt-0.5 truncate">
                    {s.owner ? `${s.owner.name} (${s.owner.email})` : "Unknown owner"}{" "}
                    · {s.mode.toUpperCase()} · {s.num_questions} question
                    {s.num_questions === 1 ? "" : "s"} ·{" "}
                    {formatDate(s.updated_at, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(s)}
                  disabled={busyId === s.id}
                  className="text-red-400/70 hover:text-red-300 p-1.5 ml-3 flex-shrink-0 transition disabled:opacity-50"
                  title="Delete"
                >
                  {busyId === s.id ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Page ───────────────────────────────────────────────
const TABS = [
  { key: "usage", label: "AI Usage", Icon: Gauge },
  { key: "users", label: "Users", Icon: UsersRound },
  { key: "saved", label: "Saved Sessions", Icon: FolderOpen },
];

export default function Admin() {
  const [allowed, setAllowed] = useState(null);
  const [tab, setTab] = useState("usage");
  const navigate = useNavigate();

  useEffect(() => {
    API.get("/me")
      .then((res) => setAllowed(res.data.is_admin))
      .catch(() => setAllowed(false));
  }, []);

  if (allowed === null)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoaderCircle size={24} className="animate-spin text-white" />
      </div>
    );

  if (!allowed)
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className={`${cardClass} p-8 text-center max-w-sm`}>
          <CircleAlert size={32} className="text-red-300 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white mb-2">
            Admin access only
          </h1>
          <p className="text-white/60 text-sm mb-4">
            Your account doesn't have access to the admin dashboard.
          </p>
          <button
            onClick={() => navigate("/dashboard")}
            className="text-indigo-300 hover:text-indigo-200 font-semibold text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div
          className={`${cardClass} p-4 mb-4 flex justify-between items-center`}
        >
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            Admin Dashboard <ShieldCheck size={22} />
          </h1>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1 text-white/50 hover:text-white text-sm font-medium transition"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>

        {/* Tabs */}
        <div className={`${cardClass} p-1.5 mb-4 grid grid-cols-3 gap-1`}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition ${
                tab === t.key
                  ? "bg-indigo-500/40 text-white border border-indigo-400/40"
                  : "text-white/60 hover:text-white border border-transparent"
              }`}
            >
              <t.Icon size={16} />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(" ")[0]}</span>
            </button>
          ))}
        </div>

        {tab === "usage" && <UsageTab />}
        {tab === "users" && <UsersTab />}
        {tab === "saved" && <SavedSessionsTab />}
      </div>
    </div>
  );
}
