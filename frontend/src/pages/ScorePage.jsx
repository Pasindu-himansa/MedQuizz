import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../api";
import {
  ChartColumn,
  Trophy,
  Star,
  ThumbsUp,
  BookOpen,
  Target,
  CircleCheck,
  CircleX,
  Check,
  X,
  LayoutDashboard,
  LoaderCircle,
  CircleAlert,
} from "lucide-react";

export default function ScorePage() {
  const { roomCode } = useParams();
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    API.get(`/session/${roomCode}/score`)
      .then((res) => setScore(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const getGrade = (p) => {
    if (p >= 90) return { label: "Excellent!", color: "text-yellow-300", Icon: Trophy };
    if (p >= 75) return { label: "Great job!", color: "text-green-300", Icon: Star };
    if (p >= 60) return { label: "Good effort!", color: "text-blue-300", Icon: ThumbsUp };
    if (p >= 50) return { label: "Keep studying!", color: "text-orange-300", Icon: BookOpen };
    return { label: "Need more practice!", color: "text-red-300", Icon: Target };
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-white font-semibold">
          <LoaderCircle size={20} className="animate-spin" />
          Calculating your score...
        </div>
      </div>
    );

  if (!score)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 text-red-300">
          <CircleAlert size={20} />
          Could not load score
        </div>
      </div>
    );

  const grade = getGrade(score.percentage);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Score Card */}
        <div className="glass-card p-8 mb-4 text-center">
          <div className="flex justify-center mb-4">
            <ChartColumn size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Session Complete!
          </h1>

          <div className="bg-white/10 rounded-2xl p-6 my-6 border border-white/20">
            <div className="text-6xl font-bold text-white">
              {score.earned}
              <span className="text-3xl text-white/40">/{score.total}</span>
            </div>
            <div className="text-2xl font-semibold text-white/70 mt-2">
              {score.percentage}%
            </div>
            <div
              className={`flex items-center justify-center gap-2 text-xl font-bold mt-2 ${grade.color}`}
            >
              <grade.Icon size={22} />
              {grade.label}
            </div>
          </div>

          <button
            onClick={() => navigate("/dashboard")}
            className="glass-btn w-full flex items-center justify-center gap-2 text-white py-3 rounded-xl font-semibold"
          >
            <LayoutDashboard size={18} />
            Back to Dashboard
          </button>
        </div>

        {/* Breakdown */}
        <div className="glass-card p-6">
          <h2 className="font-bold text-white text-lg mb-4">
            Question Breakdown
          </h2>
          <div className="space-y-3">
            {score.question_results.map((q, i) => (
              <div
                key={i}
                className={`rounded-xl p-4 border ${
                  q.marks_earned === q.marks_possible
                    ? "border-green-400/30 bg-green-500/10"
                    : q.marks_earned > 0
                      ? "border-orange-400/30 bg-orange-500/10"
                      : "border-red-400/30 bg-red-500/10"
                }`}
              >
                {score.mode === "sba" && (
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-semibold text-white">
                        Q{q.question_number}
                      </span>
                      <span
                        className={`flex items-center gap-1 font-bold text-sm ${q.is_correct ? "text-green-300" : "text-red-300"}`}
                      >
                        {q.marks_earned}/{q.marks_possible}
                        {q.is_correct ? (
                          <CircleCheck size={16} />
                        ) : (
                          <CircleX size={16} />
                        )}
                      </span>
                    </div>
                    <p className="text-sm text-white/60 mb-2 line-clamp-2">
                      {q.question}
                    </p>
                    <div className="flex gap-4 text-sm">
                      <span className="flex items-center gap-1 text-green-300">
                        <Check size={14} /> Correct:
                        <strong>{q.correct_answer?.toUpperCase()}</strong>
                      </span>
                      {!q.is_correct && (
                        <span className="flex items-center gap-1 text-red-300">
                          <X size={14} /> Yours:
                          <strong>
                            {q.user_answer?.toUpperCase() || "None"}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {score.mode === "tf" && (
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-semibold text-white">
                        Q{q.question_number}
                      </span>
                      <span
                        className={`font-bold text-sm ${
                          q.marks_earned === q.marks_possible
                            ? "text-green-300"
                            : q.marks_earned > 0
                              ? "text-orange-300"
                              : "text-red-300"
                        }`}
                      >
                        {q.marks_earned}/{q.marks_possible} marks
                      </span>
                    </div>
                    <p className="text-sm text-white/60 mb-3 line-clamp-1">
                      {q.stem}
                    </p>
                    <div className="space-y-1">
                      {q.statements.map((s, j) => (
                        <div
                          key={j}
                          className={`flex items-center gap-2 text-xs p-2 rounded-lg ${
                            s.is_correct ? "bg-green-500/20" : "bg-red-500/20"
                          }`}
                        >
                          <span className="font-bold text-white/70">
                            {s.statement})
                          </span>
                          <span className="flex-1 text-white/60 truncate">
                            {s.text}
                          </span>
                          <span
                            className={`flex items-center gap-1 font-semibold flex-shrink-0 ${s.is_correct ? "text-green-300" : "text-red-300"}`}
                          >
                            {s.is_correct ? (
                              <CircleCheck size={14} />
                            ) : (
                              <CircleX size={14} />
                            )}
                            {s.correct_answer ? "T" : "F"}
                            {!s.is_correct && (
                              <span className="text-orange-300 ml-1">
                                (You:{" "}
                                {s.user_answer
                                  ? "T"
                                  : s.user_answer === false
                                    ? "F"
                                    : "?"}
                                )
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
