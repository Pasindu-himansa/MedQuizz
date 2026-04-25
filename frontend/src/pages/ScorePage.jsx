import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../api";
import { IoStatsChartSharp } from "react-icons/io5";

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
    if (p >= 90) return { label: "Excellent! ", color: "text-yellow-300" };
    if (p >= 75) return { label: "Great job! ", color: "text-green-300" };
    if (p >= 60) return { label: "Good effort! ", color: "text-blue-300" };
    if (p >= 50) return { label: "Keep studying! ", color: "text-orange-300" };
    return { label: "Need more practice! ", color: "text-red-300" };
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white font-semibold">
          Calculating your score...
        </div>
      </div>
    );

  if (!score)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-300">Could not load score</div>
      </div>
    );

  const grade = getGrade(score.percentage);

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Score Card */}
        <div className="glass-card p-8 mb-4 text-center">
          <div className="text-6xl mb-4">
            <IoStatsChartSharp />
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
            <div className={`text-xl font-bold mt-2 ${grade.color}`}>
              {grade.label}
            </div>
          </div>

          <button
            onClick={() => navigate("/dashboard")}
            className="glass-btn w-full text-white py-3 rounded-xl font-semibold"
          >
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
                        className={`font-bold text-sm ${q.is_correct ? "text-green-300" : "text-red-300"}`}
                      >
                        {q.marks_earned}/{q.marks_possible}{" "}
                        {q.is_correct ? "✅" : "❌"}
                      </span>
                    </div>
                    <p className="text-sm text-white/60 mb-2 line-clamp-2">
                      {q.question}
                    </p>
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-300">
                        ✓ Correct:{" "}
                        <strong>{q.correct_answer?.toUpperCase()}</strong>
                      </span>
                      {!q.is_correct && (
                        <span className="text-red-300">
                          ✗ Yours:{" "}
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
                            className={`font-semibold flex-shrink-0 ${s.is_correct ? "text-green-300" : "text-red-300"}`}
                          >
                            {s.is_correct ? "✅" : "❌"}{" "}
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
