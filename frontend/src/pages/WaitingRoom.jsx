import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../api";
import { LoaderCircle, Power } from "lucide-react";

export default function WaitingRoom() {
  const { roomCode } = useParams();
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const isHostRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await API.post(`/session/join/${roomCode}`);
        setPlayers(res.data.players);
        const hostStatus = res.data.host_id === res.data.your_id;
        setIsHost(hostStatus);
        isHostRef.current = hostStatus;

        // Only redirect non-host players when session starts
        if (!isHostRef.current) {
          const questionRes = await API.get(`/session/${roomCode}/question`);
          if (
            questionRes.data.status === "active" ||
            questionRes.data.status === "generating"
          ) {
            navigate(`/session/${roomCode}`);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchSession();
    const interval = setInterval(fetchSession, 3000);
    return () => clearInterval(interval);
  }, [roomCode]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Waiting Room</h1>
          <p className="text-white/50 mt-1">Share this code with Students</p>
          <div className="mt-4 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <p className="text-5xl font-bold tracking-widest text-white">
              {roomCode}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="font-semibold text-white/80 mb-3">
            Students ({players.length})
          </h3>
          <div className="space-y-2">
            {players.map((player, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/10"
              >
                <div className="w-8 h-8 bg-indigo-500/50 rounded-full flex items-center justify-center text-white font-bold border border-indigo-400/30">
                  {player.name[0].toUpperCase()}
                </div>
                <span className="font-medium text-white">{player.name}</span>
                {i === 0 && (
                  <span className="ml-auto text-xs bg-indigo-500/30 text-indigo-200 px-2 py-1 rounded-full border border-indigo-400/30">
                    Host
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {isHost ? (
          <button
            onClick={() => navigate(`/session/${roomCode}`)}
            className="w-full bg-indigo-500/70 backdrop-blur-sm border border-white/20 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-indigo-500/90 transition"
          >
            Start Session <Power size={18} />
          </button>
        ) : (
          <div className="text-center text-white/50 py-3 flex items-center justify-center gap-2">
            <LoaderCircle className="animate-spin" size={18} /> Waiting for host
            to start...
          </div>
        )}
      </div>
    </div>
  );
}
