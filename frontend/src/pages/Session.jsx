import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../api";
import { GiBrain, PiFlowerLotusBold, IoStatsChartSharp } from "react-icons/gi";
import { CircleCheck, LoaderCircle, Eye, ArrowRight } from "lucide-react";

export default function Session() {
  const { roomCode } = useParams();
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(0);
  const [total, setTotal] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [answerSummary, setAnswerSummary] = useState({});
  const [finished, setFinished] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [mode, setMode] = useState("sba");
  const [tfAnswers, setTfAnswers] = useState({
    a: null,
    b: null,
    c: null,
    d: null,
    e: null,
  });
  const [tfCorrect, setTfCorrect] = useState(null);
  const wsRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadQuestion();
    connectWebSocket();
    return () => wsRef.current?.close();
  }, []);

  const connectWebSocket = () => {
    const wsUrl = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000")
      .replace("https://", "wss://")
      .replace("http://", "ws://");
    const ws = new WebSocket(`${wsUrl}/ws/${roomCode}`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "answer_update") {
        setAnswered(msg.answered);
        setTotal(msg.total);
      }
      if (msg.type === "reveal") {
        setCorrectAnswer(msg.correct_answer);
        setAnswerSummary(msg.answer_summary);
        setRevealed(true);
      }
      if (msg.type === "reveal_tf") {
        setTfCorrect(msg.correct_answers);
        setAnswerSummary(msg.answer_summary);
        setRevealed(true);
      }
      if (msg.type === "explanation") {
        setExplanation(msg.explanation);
      }
      if (msg.type === "next_question") {
        setSelected(null);
        setRevealed(false);
        setExplanation(null);
        setCorrectAnswer(null);
        setAnswerSummary({});
        setAnswered(0);
        setExplaining(false);
        setTfAnswers({ a: null, b: null, c: null, d: null, e: null });
        setTfCorrect(null);
        loadQuestion();
      }
      if (msg.type === "session_finished") {
        setFinished(true);
      }
    };
  };

  const loadQuestion = async () => {
    try {
      const res = await API.get(`/session/${roomCode}/question`);
      if (res.data.status === "generating") {
        setTimeout(loadQuestion, 2000);
        return;
      }
      if (res.data.status === "finished") {
        setFinished(true);
        return;
      }
      setQuestion(res.data);
      setMode(res.data.mode || "sba");
      const joinRes = await API.post(`/session/join/${roomCode}`);
      setIsHost(joinRes.data.host_id === joinRes.data.your_id);
      setTotal(joinRes.data.players.length);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAnswer = async (option) => {
    if (revealed) return;
    setSelected(option);
    try {
      await API.post(`/session/${roomCode}/answer`, {
        room_code: roomCode,
        question_id: question.question.id,
        answer: option,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleTFAnswer = async (statement, value) => {
    if (revealed) return;
    const newAnswers = { ...tfAnswers, [statement]: value };
    setTfAnswers(newAnswers);
    if (Object.values(newAnswers).every((v) => v !== null)) {
      try {
        await API.post(`/session/${roomCode}/answer_tf`, {
          room_code: roomCode,
          question_id: question.question.id,
          answers: newAnswers,
        });
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleReveal = async () => {
    setLoading(true);
    try {
      await API.post(`/session/${roomCode}/reveal`);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleExplain = async () => {
    setExplaining(true);
    try {
      await API.post(`/session/${roomCode}/explain`);
    } catch (err) {
      console.error(err);
    }
    setExplaining(false);
  };

  const handleNext = async () => {
    try {
      await API.post(`/session/${roomCode}/next`);
    } catch (err) {
      console.error(err);
    }
  };

  const optionStyle = (option) => {
    if (!revealed) {
      return selected === option
        ? "border-indigo-400/70 bg-indigo-500/30 text-white"
        : "border-white/20 text-white/80 hover:border-indigo-400/50 hover:bg-indigo-500/20";
    }
    if (option === correctAnswer)
      return "border-green-400/70 bg-green-500/30 text-green-200";
    if (option === selected && option !== correctAnswer)
      return "border-red-400/70 bg-red-500/30 text-red-200";
    return "border-white/10 text-white/30";
  };

  if (finished) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="text-6xl mb-4 flex items-center justify-center">
            <PiFlowerLotusBold color="white" size={64} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Session Complete!
          </h1>
          <p className="text-white/50 mb-6">Great studying everyone! 💪</p>
          <button
            onClick={() => navigate(`/score/${roomCode}`)}
            className="w-full bg-indigo-500/70 backdrop-blur-sm border border-white/20 text-white py-3 rounded-lg font-semibold hover:bg-indigo-500/90 transition mb-3"
          >
            <IoStatsChartSharp /> View My Score
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="w-full border border-white/20 text-white/60 py-3 rounded-lg font-semibold hover:bg-white/10 transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-8 text-center max-w-sm">
          <div className="text-5xl mb-4 flex items-center justify-center">
            <GiBrain size={32} color="white" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            AI is generating your question...
          </h2>
          <p className="text-white/50 text-sm">
            Fresh medical questions being created just for you
          </p>
          <div className="mt-4 flex justify-center gap-1">
            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
            <div
              className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
              style={{ animationDelay: "0.2s" }}
            ></div>
            <div
              className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
              style={{ animationDelay: "0.4s" }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  const q = question.question;
  const options = [
    { key: "a", label: "A", text: q.option_a },
    { key: "b", label: "B", text: q.option_b },
    { key: "c", label: "C", text: q.option_c },
    { key: "d", label: "D", text: q.option_d },
    { key: "e", label: "E", text: q.option_e },
  ];

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-4 mb-4 flex justify-between items-center">
          <h1 className="text-lg font-bold text-white">MedQuizz 🩺</h1>
          <span className="text-white/50 text-sm">
            Q {question.question_number} / {question.total_questions}
          </span>
          <span className="text-sm bg-white/10 text-white/70 px-3 py-1 rounded-full border border-white/20">
            {answered}/{total} answered
          </span>
        </div>

        {/* Question */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-6 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs bg-indigo-500/30 text-indigo-200 px-3 py-1 rounded-full border border-indigo-400/30 font-medium uppercase">
              {mode}
            </span>
          </div>
          <p className="text-white font-medium text-lg leading-relaxed">
            {mode === "tf" ? q.stem : q.question}
          </p>
        </div>

        {/* SBA Options */}
        {mode === "sba" && (
          <div className="space-y-3 mb-4">
            {options.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleAnswer(opt.key)}
                disabled={revealed}
                className={`w-full text-left border-2 rounded-xl px-5 py-4 font-medium transition backdrop-blur-sm ${optionStyle(opt.key)}`}
              >
                <span className="font-bold mr-3">{opt.label})</span>
                {opt.text}
              </button>
            ))}
          </div>
        )}

        {/* T/F Options */}
        {mode === "tf" && (
          <div className="space-y-3 mb-4">
            {["a", "b", "c", "d", "e"].map((key) => {
              const statements = {
                a: q.statement_a,
                b: q.statement_b,
                c: q.statement_c,
                d: q.statement_d,
                e: q.statement_e,
              };
              const isCorrect = tfCorrect ? tfCorrect[key] : null;
              const userAnswer = tfAnswers[key];

              return (
                <div
                  key={key}
                  className={`border rounded-xl p-4 backdrop-blur-sm transition ${
                    revealed
                      ? isCorrect
                        ? "border-green-400/50 bg-green-500/20"
                        : "border-red-400/50 bg-red-500/20"
                      : "border-white/20 bg-white/5"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="font-bold text-white/60 mt-1">
                      {key.toUpperCase()})
                    </span>
                    <p className="flex-1 text-white/80">{statements[key]}</p>
                  </div>
                  {!revealed && (
                    <div className="flex gap-3 mt-3">
                      <button
                        onClick={() => handleTFAnswer(key, true)}
                        className={`flex-1 py-2 rounded-lg font-semibold border transition ${
                          userAnswer === true
                            ? "border-green-400/70 bg-green-500/40 text-green-100"
                            : "border-green-400/30 text-green-300 hover:bg-green-500/20"
                        }`}
                      >
                        ✓ True
                      </button>
                      <button
                        onClick={() => handleTFAnswer(key, false)}
                        className={`flex-1 py-2 rounded-lg font-semibold border transition ${
                          userAnswer === false
                            ? "border-red-400/70 bg-red-500/40 text-red-100"
                            : "border-red-400/30 text-red-300 hover:bg-red-500/20"
                        }`}
                      >
                        ✗ False
                      </button>
                    </div>
                  )}
                  {revealed && (
                    <div
                      className={`mt-2 text-sm font-semibold ${isCorrect ? "text-green-300" : "text-red-300"}`}
                    >
                      {isCorrect ? "✓ TRUE" : "✗ FALSE"}
                      {userAnswer !== null && userAnswer !== isCorrect && (
                        <span className="ml-2 text-orange-300">
                          (You: {userAnswer ? "True" : "False"})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!revealed && (
              <div className="text-center text-white/40 text-sm py-1">
                {Object.values(tfAnswers).filter((v) => v !== null).length}/5
                answered
                {Object.values(tfAnswers).every((v) => v !== null) && (
                  <span className="ml-2 text-green-300 font-semibold flex items-center justify-center gap-1">
                    <CircleCheck size={16} color="#67ea10" /> All answered!
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Answer submitted status */}
        {selected && !revealed && mode === "sba" && (
          <div className="bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 rounded-xl p-4 text-center mb-4 flex items-center justify-center gap-2">
            <CircleCheck size={18} color="#67ea10" /> Answer submitted! Waiting
            for others... ({answered}/{total})
          </div>
        )}

        {/* Host controls */}
        {isHost && !revealed && (
          <button
            onClick={handleReveal}
            disabled={loading}
            className="w-full bg-indigo-500/70 backdrop-blur-sm border border-white/20 text-white py-3 rounded-xl font-semibold mb-4 disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-indigo-500/90 transition"
          >
            {loading ? (
              <>
                <LoaderCircle className="animate-spin" /> Getting answer...
              </>
            ) : (
              <>
                <Eye /> Reveal Answer
              </>
            )}
          </button>
        )}

        {/* Revealed section */}
        {revealed && (
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-6 mb-4">
            {/* SBA correct answer */}
            {mode === "sba" && (
              <h3 className="font-bold text-lg text-white mb-3 flex items-center gap-2">
                <CircleCheck size={20} color="#3fa258" /> Correct Answer:{" "}
                <span className="text-green-300 uppercase">
                  {correctAnswer}
                </span>
              </h3>
            )}

            {/* T/F correct answers */}
            {mode === "tf" && (
              <h3 className="font-bold text-lg text-white mb-3 flex items-center gap-2">
                <CircleCheck size={20} color="#67ea10" /> Answers Revealed
              </h3>
            )}

            {/* Who answered what */}
            {Object.keys(answerSummary).length > 0 && (
              <div className="mb-4">
                <h4 className="font-semibold text-white/70 mb-2 text-sm">
                  Student Answers:
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(answerSummary).map(([player, answer]) => (
                    <div
                      key={player}
                      className="rounded-lg px-3 py-2 text-sm font-medium bg-white/10 border border-white/10 text-white/70"
                    >
                      {player}:{" "}
                      <strong className="text-white">
                        {typeof answer === "string" && answer.startsWith("{")
                          ? "✓ Answered"
                          : answer.toUpperCase()}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Explanation */}
            {explanation ? (
              <div className="bg-indigo-500/20 rounded-xl p-4 border border-indigo-400/30">
                <h4 className="font-bold text-indigo-200 mb-2 flex items-center gap-2">
                  <GiBrain size={20} /> AI Explanation:
                </h4>
                <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">
                  {explanation}
                </p>
              </div>
            ) : (
              isHost && (
                <button
                  onClick={handleExplain}
                  disabled={explaining}
                  className="w-full bg-purple-600/70 backdrop-blur-sm border border-white/20 text-white py-3 rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-purple-600/90 transition"
                >
                  {explaining ? (
                    <span className="flex items-center justify-center gap-2">
                      <GiBrain size={24} /> AI is thinking
                      <span className="flex gap-1">
                        <span className="w-2 h-2 bg-white rounded-full animate-bounce"></span>
                        <span
                          className="w-2 h-2 bg-white rounded-full animate-bounce"
                          style={{ animationDelay: "0.2s" }}
                        ></span>
                        <span
                          className="w-2 h-2 bg-white rounded-full animate-bounce"
                          style={{ animationDelay: "0.4s" }}
                        ></span>
                      </span>
                    </span>
                  ) : (
                    <>
                      <GiBrain size={20} /> Get AI Explanation
                    </>
                  )}
                </button>
              )
            )}

            {/* Next button */}
            {isHost && (
              <button
                onClick={handleNext}
                className="w-full bg-indigo-500/70 backdrop-blur-sm border border-white/20 text-white py-3 rounded-xl font-semibold mt-3 flex items-center justify-center gap-2 hover:bg-indigo-500/90 transition"
              >
                Next Question <ArrowRight size={18} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
