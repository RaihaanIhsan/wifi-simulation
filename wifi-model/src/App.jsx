import { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
  PieChart, Pie, Cell
} from "recharts";

// ─── MATH ENGINE ────────────────────────────────────────────────────────────
const STATES = ["Normal", "High Load", "Overloaded", "Down"];
const STATE_COLORS = ["#00ff88", "#ffcc00", "#ff6600", "#ff2255"];

const STATE_BG = [
  "linear-gradient(135deg, #0d2e1f 0%, #163d29 100%)",
  "linear-gradient(135deg, #2e2200 0%, #3d2e00 100%)",
  "linear-gradient(135deg, #2e1400 0%, #3d1e00 100%)",
  "linear-gradient(135deg, #2e0011 0%, #3d0018 100%)",
];

function buildTransitionMatrix(lambda, recoveryP) {
  const overloadP = Math.min(0.95, (lambda / 200) * 0.6);
  const highP = Math.min(0.95, (lambda / 200) * 0.4);
  const failP = Math.min(0.8, overloadP * 0.5);
  return [
    [Math.max(0.05, 1 - highP - 0.02), highP, 0.02, 0.0],
    [0.15, Math.max(0.05, 1 - 0.15 - overloadP - 0.05), overloadP, 0.05],
    [0.05, 0.1, Math.max(0.05, 1 - 0.05 - 0.1 - failP), failP],
    [recoveryP, 0.05, 0.1, Math.max(0, 0.85 - recoveryP)],
  ];
}

function stationaryDist(P) {
  const n = P.length;
  let pi = Array(n).fill(1 / n);
  for (let iter = 0; iter < 1000; iter++) {
    const next = Array(n).fill(0);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) next[j] += pi[i] * P[i][j];
    if (next.every((v, i) => Math.abs(v - pi[i]) < 1e-9)) { pi = next; break; }
    pi = next;
  }
  return pi;
}

function meanFirstPassage(P, targetState) {
  const n = P.length;
  const m = Array(n).fill(0);
  for (let iter = 0; iter < 500; iter++) {
    const prev = [...m];
    for (let i = 0; i < n; i++) {
      if (i === targetState) { m[i] = 0; continue; }
      m[i] = 1 + P[i].reduce((s, p, j) => s + (j !== targetState ? p * prev[j] : 0), 0);
    }
    if (m.every((v, i) => Math.abs(v - prev[i]) < 0.01)) break;
  }
  return m;
}

function poissonSample(lambda) {
  let L = Math.exp(-lambda), k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

function runSimulation(steps, lambda, recoveryP) {
  const P = buildTransitionMatrix(lambda, recoveryP);
  let state = 0;
  const history = [];
  const stateCounts = [0, 0, 0, 0];
  for (let t = 0; t < steps; t++) {
    stateCounts[state]++;
    const arrivals = poissonSample(lambda);
    const r = Math.random();
    let cum = 0, next = state;
    for (let j = 0; j < 4; j++) { cum += P[state][j]; if (r < cum) { next = j; break; } }
    history.push({ t, state, arrivals, stateName: STATES[state] });
    state = next;
  }
  return { history, stateCounts };
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const glassCard = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 16,
  padding: "24px",
};

const tooltipStyle = {
  background: "#0d1a26",
  border: "1px solid #2a3a4a",
  fontFamily: "monospace",
  fontSize: 13,
  color: "#e0e8f0",
};

// ─── COMPONENTS ─────────────────────────────────────────────────────────────
function StateBall({ stateIdx, size = 80, pulse = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `radial-gradient(circle at 35% 35%, ${STATE_COLORS[stateIdx]}66, ${STATE_COLORS[stateIdx]}22)`,
      border: `2px solid ${STATE_COLORS[stateIdx]}`,
      boxShadow: `0 0 ${pulse ? 30 : 15}px ${STATE_COLORS[stateIdx]}${pulse ? "99" : "55"}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.28, fontWeight: 700, color: STATE_COLORS[stateIdx],
      fontFamily: "'Courier New', monospace",
      transition: "all 0.4s ease",
      animation: pulse ? "pulseGlow 1s ease-in-out infinite alternate" : "none",
    }}>
      S{stateIdx}
    </div>
  );
}

function MarkovDiagram({ P, currentState }) {
  const cx = [200, 480, 200, 480];
  const cy = [120, 120, 320, 320];
  const r = 52;

  const arc = (from, to) => {
    const dx = cx[to] - cx[from], dy = cy[to] - cy[from];
    const len = Math.sqrt(dx * dx + dy * dy);
    const mx = (cx[from] + cx[to]) / 2, my = (cy[from] + cy[to]) / 2;
    const cpx = mx - dy * 0.22, cpy = my + dx * 0.22;
    const x1 = cx[from] + (dx / len) * r, y1 = cy[from] + (dy / len) * r;
    const x2 = cx[to] - (dx / len) * r, y2 = cy[to] - (dy / len) * r;
    return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;
  };

  return (
    <svg viewBox="0 0 680 440" style={{ width: "100%", maxHeight: 360, filter: "drop-shadow(0 0 20px rgba(0,200,255,0.2))" }}>
      <defs>
        {STATE_COLORS.map((c, i) => (
          <marker key={i} id={`arr${i}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={c} opacity="0.9" />
          </marker>
        ))}
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {P.map((row, from) =>
        row.map((prob, to) => {
          if (from === to || prob < 0.01) return null;
          const color = STATE_COLORS[from];
          const mid = arc(from, to);
          const pts = mid.match(/[\d.]+/g).map(Number);
          const tx = pts[pts.length - 2], ty = pts[pts.length - 1];
          return (
            <g key={`${from}-${to}`}>
              <path d={arc(from, to)} fill="none" stroke={color}
                strokeWidth={Math.max(1, prob * 6)}
                opacity={0.6 + prob * 0.4}
                markerEnd={`url(#arr${from})`} filter="url(#glow)" />
              <text x={(pts[0] + tx) / 2 - 4} y={(pts[1] + ty) / 2 - 6}
                fill={color} fontSize="13" fontFamily="'Courier New', monospace"
                opacity={0.95} fontWeight="600">
                {prob.toFixed(2)}
              </text>
            </g>
          );
        })
      )}

      {P.map((row, i) => {
        const p = row[i]; if (p < 0.01) return null;
        return (
          <g key={`self${i}`}>
            <ellipse cx={cx[i]} cy={cy[i] - r - 20} rx={22} ry={16}
              fill="none" stroke={STATE_COLORS[i]} strokeWidth={1.5} opacity={0.6}
              markerEnd={`url(#arr${i})`} />
            <text x={cx[i] - 12} y={cy[i] - r - 38}
              fill={STATE_COLORS[i]} fontSize="13"
              fontFamily="'Courier New', monospace" fontWeight="600">
              {p.toFixed(2)}
            </text>
          </g>
        );
      })}

      {STATES.map((name, i) => (
        <g key={i}>
          <circle cx={cx[i]} cy={cy[i]} r={r}
            fill={`${STATE_COLORS[i]}22`}
            stroke={STATE_COLORS[i]}
            strokeWidth={i === currentState ? 3 : 1.5}
            filter={i === currentState ? "url(#glow)" : ""} />
          {i === currentState && (
            <circle cx={cx[i]} cy={cy[i]} r={r + 8} fill="none"
              stroke={STATE_COLORS[i]} strokeWidth="1" opacity="0.4"
              style={{ animation: "ping 1s ease-out infinite" }} />
          )}
          <text x={cx[i]} y={cy[i] + 12} textAnchor="middle"
            fill="white" fontSize="13"
            fontFamily="'Courier New', monospace" fontWeight="700">{name}</text>
          <text x={cx[i]} y={cy[i] + 26} textAnchor="middle"
            fill={STATE_COLORS[i]} fontSize="11"
            fontFamily="'Courier New', monospace">S{i}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function WiFiModel() {
  // Draft values — what the sliders show before RUN is clicked
  const [draftLambda, setDraftLambda] = useState(80);
  const [draftRecoveryP, setDraftRecoveryP] = useState(0.3);
  const [draftSimSteps, setDraftSimSteps] = useState(200);

  // Committed values — what all math & charts actually use
  const [lambda, setLambda] = useState(80);
  const [recoveryP, setRecoveryP] = useState(0.3);
  const [simSteps, setSimSteps] = useState(200);

  const [simResult, setSimResult] = useState(null);
  const [liveState, setLiveState] = useState(0);
  const [liveHistory, setLiveHistory] = useState([]);
  const [isLive, setIsLive] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [dirty, setDirty] = useState(false);

  const liveRef = useRef(null);
  const liveStateRef = useRef(0);

  // All math uses committed values
  const P = buildTransitionMatrix(lambda, recoveryP);
  const pi = stationaryDist(P);
  const mfpt = meanFirstPassage(P, 3);

  const handleRun = () => {
    // Commit draft → real
    setLambda(draftLambda);
    setRecoveryP(draftRecoveryP);
    setSimSteps(draftSimSteps);
    // Run simulation with draft values directly (state update is async)
    const result = runSimulation(draftSimSteps, draftLambda, draftRecoveryP);
    setSimResult(result);
    setDirty(false);
    // Stop live if running
    if (isLive) {
      clearInterval(liveRef.current);
      setIsLive(false);
      setLiveHistory([]);
    }
  };

  const toggleLive = () => {
    if (isLive) {
      clearInterval(liveRef.current);
      setIsLive(false);
    } else {
      liveStateRef.current = 0;
      setLiveHistory([]);
      setIsLive(true);
      let t = 0;
      const Plive = buildTransitionMatrix(lambda, recoveryP);
      liveRef.current = setInterval(() => {
        const state = liveStateRef.current;
        const row = Plive[state];
        const r = Math.random(); let cum = 0, next = state;
        for (let j = 0; j < 4; j++) { cum += row[j]; if (r < cum) { next = j; break; } }
        liveStateRef.current = next;
        setLiveState(next);
        setLiveHistory(h => [...h.slice(-59), { t: t++, state: next, arrivals: poissonSample(lambda) }]);
      }, 400);
    }
  };

  useEffect(() => () => clearInterval(liveRef.current), []);

  const simChartData = simResult ? simResult.history.slice(0, 150) : [];

  const freqData = simResult
    ? STATES.map((s, i) => ({
        name: s,
        simFreq: +(simResult.stateCounts[i] / simSteps * 100).toFixed(1),
        theoretical: +(pi[i] * 100).toFixed(1),
      }))
    : STATES.map((s, i) => ({ name: s, simFreq: 0, theoretical: +(pi[i] * 100).toFixed(1) }));

  const poissonData = Array.from({ length: 30 }, (_, i) => {
    const k = Math.max(0, Math.floor(lambda - 15) + i);
    let logP = -lambda + k * Math.log(lambda);
    for (let j = 2; j <= k; j++) logP -= Math.log(j);
    return { k, probability: +(Math.exp(logP) * 100).toFixed(4) };
  });

  const liveChartData = liveHistory.map(d => ({ ...d, stateVal: d.state }));
  const overloadProb = pi[2] + pi[3];

  const tabs = [
    { id: "overview",   label: "📊 Overview"    },
    { id: "markov",     label: "🔗 Markov Chain" },
    { id: "simulation", label: "🎬 Simulation"   },
    { id: "poisson",    label: "📈 Poisson"      },
    { id: "analysis",   label: "🔬 Analysis"     },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#050a0f",
      fontFamily: "'Courier New', 'Consolas', monospace",
      color: "#e0e8f0",
    }}>
      <style>{`
        @keyframes pulseGlow { from { box-shadow: 0 0 15px currentColor; } to { box-shadow: 0 0 40px currentColor, 0 0 80px currentColor; } }
        @keyframes ping { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(1.4);opacity:0} }
        @keyframes slideIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:6px;background:#0a0f14}
        ::-webkit-scrollbar-thumb{background:#2a3a4a;border-radius:3px}
        .tab-btn{background:none;border:none;cursor:pointer;transition:all 0.2s;font-family:inherit}
        .tab-btn:hover{background:rgba(255,255,255,0.1)!important}
        .slider::-webkit-slider-thumb{width:18px;height:18px;border-radius:50%;background:#00ccff;cursor:pointer;-webkit-appearance:none;box-shadow:0 0 10px #00ccff88}
        .slider::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,#00ccff,#0044ff)}
        .card-hover{transition:transform 0.2s,box-shadow 0.2s}
        .card-hover:hover{transform:translateY(-3px);box-shadow:0 8px 40px rgba(0,200,255,0.2)!important}
        .run-btn{transition:all 0.15s ease;cursor:pointer}
        .run-btn:hover{transform:scale(1.05)}
        .run-btn:active{transform:scale(0.97)}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{
        background: "linear-gradient(135deg, #0d1f3a 0%, #070f1c 60%, #0d0d28 100%)",
        borderBottom: "1px solid rgba(0,200,255,0.25)",
        padding: "28px 40px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(0,200,255,0.03) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(0,200,255,0.03) 40px)" }} />
        <div style={{ position: "relative" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(22px,4vw,36px)", fontWeight: 700, letterSpacing: 1, color: "white" }}>
            📶 University WiFi <span style={{ color: "#00ccff" }}>Load & Failure</span> Model
          </h1>
          <p style={{ margin: "8px 0 0", color: "#aabbcc", fontSize: 15 }}>
            Poisson arrivals · 4-State Markov Chain · Real-time Monte Carlo Simulation
          </p>
        </div>
      </div>

      {/* ── TOP METRIC CARDS (show committed values) ── */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "20px 40px 0" }}>
        {[
          { label: "λ (arrivals/min)", val: lambda, color: "#00ccff" },
          { label: "Overload Risk", val: `${(overloadProb * 100).toFixed(1)}%`, color: overloadProb > 0.3 ? "#ff4455" : overloadProb > 0.15 ? "#ffaa00" : "#00ff88" },
          { label: "MFPT to Failure", val: `${mfpt[0].toFixed(0)} min`, color: "#aa88ff" },
          { label: "Recovery P", val: recoveryP.toFixed(2), color: "#ffaa00" },
          { label: "Sim Steps", val: simSteps, color: "#aabbcc" },
        ].map(({ label, val, color }) => (
          <div key={label} className="card-hover" style={{
            background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 14, padding: "14px 22px", textAlign: "center", minWidth: 120,
          }}>
            <div style={{ fontSize: 13, color: "#ccd8e0", marginBottom: 5, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* ── TABS ── */}
      <div style={{ display: "flex", gap: 4, padding: "16px 40px 0", borderBottom: "1px solid rgba(255,255,255,0.1)", background: "#070d14", overflowX: "auto" }}>
        {tabs.map(tab => (
          <button key={tab.id} className="tab-btn" onClick={() => setActiveTab(tab.id)} style={{
            padding: "10px 20px", borderRadius: "8px 8px 0 0", fontSize: 15,
            color: activeTab === tab.id ? "#00ccff" : "#aabbcc",
            borderBottom: activeTab === tab.id ? "2px solid #00ccff" : "2px solid transparent",
            background: activeTab === tab.id ? "rgba(0,200,255,0.12)" : "none",
            whiteSpace: "nowrap", letterSpacing: 0.5,
          }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ── PARAMETER CONTROLS ── */}
        <div style={{
          ...glassCard, marginBottom: 28,
          display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center",
          borderColor: dirty ? "rgba(255,170,0,0.7)" : "rgba(0,200,255,0.35)",
          transition: "border-color 0.3s ease",
        }}>
          {[
            { label: "λ — Arrivals/min",    color: "#00ccff", min: 10,   max: 200,  step: 1,    val: draftLambda,    set: v => { setDraftLambda(v);    setDirty(true); }, disp: draftLambda },
            { label: "Recovery Probability", color: "#aa88ff", min: 0.05, max: 0.95, step: 0.05, val: draftRecoveryP, set: v => { setDraftRecoveryP(v); setDirty(true); }, disp: draftRecoveryP.toFixed(2) },
            { label: "Simulation Steps",     color: "#ffaa00", min: 50,   max: 1000, step: 50,   val: draftSimSteps,  set: v => { setDraftSimSteps(v);  setDirty(true); }, disp: draftSimSteps },
          ].map(({ label, color, min, max, step, val, set, disp }) => (
            <div key={label} style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ color, fontSize: 15, fontWeight: 600 }}>{label}</span>
                <span style={{ color: "white", fontSize: 18, fontWeight: 700 }}>{disp}</span>
              </div>
              <input type="range" min={min} max={max} step={step} value={val}
                onChange={e => set(+e.target.value)}
                className="slider"
                style={{ width: "100%", appearance: "none", height: 4, outline: "none", border: "none", background: "transparent" }} />
            </div>
          ))}

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <button
              className="run-btn"
              onClick={handleRun}
              style={{
                padding: "13px 36px", borderRadius: 10, border: "none",
                background: dirty
                  ? "linear-gradient(135deg, #bb6600, #ffaa00)"
                  : "linear-gradient(135deg, #0044cc, #0088ff)",
                color: "white", fontSize: 16, fontWeight: 700,
                fontFamily: "inherit", letterSpacing: 1,
                boxShadow: dirty ? "0 0 24px #ffaa0077" : "0 0 20px #0066ff55",
              }}>
              RUN
            </button>
            <span style={{ fontSize: 11, color: dirty ? "#ffaa00" : "#445566", letterSpacing: 1, transition: "color 0.3s" }}>
              {dirty ? "unsaved changes" : "up to date"}
            </span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* OVERVIEW TAB                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 18, marginBottom: 28 }}>
              {STATES.map((name, i) => (
                <div key={i} className="card-hover" style={{
                  background: STATE_BG[i], border: `1px solid ${STATE_COLORS[i]}88`,
                  borderRadius: 16, padding: "24px", textAlign: "center",
                }}>
                  <div style={{ color: STATE_COLORS[i], fontSize: 13, letterSpacing: 2, marginBottom: 6, fontWeight: 700 }}>
                    S{i} — {name.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 700, color: "white" }}>{(pi[i] * 100).toFixed(1)}%</div>
                  <div style={{ fontSize: 13, color: "#ccd8e0", marginTop: 5 }}>long-run probability</div>
                  <div style={{ marginTop: 14, height: 5, borderRadius: 3, background: "rgba(0,0,0,0.4)" }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${pi[i] * 100}%`, background: STATE_COLORS[i], boxShadow: `0 0 8px ${STATE_COLORS[i]}` }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
              <div style={glassCard}>
                <h3 style={{ margin: "0 0 16px", color: "#00ccff", fontSize: 15, letterSpacing: 2 }}>TRANSITION MATRIX P</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "7px 12px", color: "#aabbcc" }}>From\To</th>
                        {STATES.map((s, i) => <th key={i} style={{ padding: "7px 12px", color: STATE_COLORS[i], fontWeight: 700 }}>S{i}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {P.map((row, i) => (
                        <tr key={i}>
                          <td style={{ padding: "7px 12px", color: STATE_COLORS[i], fontWeight: 700 }}>S{i}</td>
                          {row.map((v, j) => (
                            <td key={j} style={{ padding: "7px 12px", textAlign: "center", color: v > 0.3 ? STATE_COLORS[i] : "#ccd8e0", fontWeight: v > 0.3 ? 700 : 400 }}>{v.toFixed(3)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={glassCard}>
                <h3 style={{ margin: "0 0 16px", color: "#aa88ff", fontSize: 15, letterSpacing: 2 }}>MEAN FIRST PASSAGE TIME</h3>
                <p style={{ fontSize: 13, color: "#ccd8e0", marginBottom: 16 }}>Expected time (minutes) to reach each state from S0 (Normal)</p>
                {STATES.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ color: STATE_COLORS[i], fontSize: 14, fontWeight: 600 }}>{s}</span>
                        <span style={{ color: "white", fontWeight: 700, fontSize: 15 }}>{mfpt[i].toFixed(1)} min</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: "rgba(0,0,0,0.5)" }}>
                        <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(100, mfpt[i] / 50 * 100)}%`, background: STATE_COLORS[i] }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {overloadProb > 0.3 && (
              <div style={{ ...glassCard, borderColor: "#ff4455", background: "rgba(255,40,70,0.12)" }}>
                <div style={{ color: "#ff4455", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>CRITICAL: Bandwidth Upgrade Required</div>
                <div style={{ color: "#f0b0b8", fontSize: 15 }}>Overload probability is {(overloadProb * 100).toFixed(1)}% — exceeds 30% threshold. Recommend immediate infrastructure review.</div>
              </div>
            )}
            {overloadProb > 0.15 && overloadProb <= 0.3 && (
              <div style={{ ...glassCard, borderColor: "#ffaa00", background: "rgba(255,170,0,0.1)" }}>
                <div style={{ color: "#ffaa00", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>WARNING: Monitor Network Load</div>
                <div style={{ color: "#f0d890", fontSize: 15 }}>Overload probability at {(overloadProb * 100).toFixed(1)}%. Plan bandwidth expansion within next quarter.</div>
              </div>
            )}
            {overloadProb <= 0.15 && (
              <div style={{ ...glassCard, borderColor: "#00ff88", background: "rgba(0,255,136,0.07)" }}>
                <div style={{ color: "#00ff88", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Network Operating Within Safe Limits</div>
                <div style={{ color: "#a0f0cc", fontSize: 15 }}>Overload probability {(overloadProb * 100).toFixed(1)}% — below critical threshold. System is stable.</div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* MARKOV TAB                                                         */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "markov" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 24 }}>
              <div style={glassCard}>
                <h3 style={{ margin: "0 0 20px", color: "#00ccff", fontSize: 15, letterSpacing: 2 }}>STATE TRANSITION DIAGRAM</h3>
                <MarkovDiagram P={P} currentState={liveState} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={glassCard}>
                  <h3 style={{ margin: "0 0 16px", color: "#ffaa00", fontSize: 15, letterSpacing: 2 }}>STATIONARY DISTRIBUTION π</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={STATES.map((s, i) => ({ name: s, value: pi[i] }))} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                        {STATES.map((_, i) => <Cell key={i} fill={STATE_COLORS[i]} />)}
                      </Pie>
                      <Tooltip formatter={v => `${(v * 100).toFixed(2)}%`} contentStyle={tooltipStyle} />
                      <Legend formatter={(v) => <span style={{ color: STATE_COLORS[STATES.indexOf(v)], fontSize: 13 }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={glassCard}>
                  <h3 style={{ margin: "0 0 12px", color: "#aa88ff", fontSize: 15, letterSpacing: 2 }}>MODEL PARAMETERS</h3>
                  {[
                    ["Arrival Rate (λ)", `${lambda} req/min`],
                    ["Recovery P", `${(recoveryP * 100).toFixed(0)}%`],
                    ["Overload Probability", `${(overloadProb * 100).toFixed(2)}%`],
                    ["E[States in Normal]", `${(pi[0] * 100).toFixed(1)}%`],
                    ["Mean Time to Fail", `${mfpt[0].toFixed(1)} min`],
                    ["Chain Type", "Ergodic, Regular"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.1)", fontSize: 14 }}>
                      <span style={{ color: "#ccd8e0" }}>{k}</span>
                      <span style={{ color: "white", fontWeight: 700 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* SIMULATION TAB                                                     */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "simulation" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ ...glassCard, marginBottom: 24, borderColor: isLive ? "#00ff88" : "rgba(255,255,255,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <h3 style={{ margin: 0, color: "#00ff88", fontSize: 15, letterSpacing: 2 }}>LIVE SIMULATION</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <StateBall stateIdx={liveState} size={56} pulse={isLive} />
                  <div>
                    <div style={{ color: STATE_COLORS[liveState], fontSize: 18, fontWeight: 700 }}>{STATES[liveState]}</div>
                    <div style={{ color: "#ccd8e0", fontSize: 13 }}>Current State</div>
                  </div>
                  <button onClick={toggleLive} style={{
                    padding: "11px 26px", borderRadius: 8,
                    border: `2px solid ${isLive ? "#ff4455" : "#00ff88"}`,
                    background: isLive ? "rgba(255,40,70,0.18)" : "rgba(0,255,136,0.12)",
                    color: isLive ? "#ff4455" : "#00ff88",
                    cursor: "pointer", fontSize: 15, fontFamily: "inherit", fontWeight: 700,
                  }}>{isLive ? "STOP" : "START LIVE"}</button>
                </div>
              </div>
              {liveChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={liveChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2a3a" />
                    <XAxis dataKey="t" stroke="#4a5a6a" fontSize={12} />
                    <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} stroke="#4a5a6a" fontSize={12} tickFormatter={v => STATES[v] ? STATES[v][0] : v} />
                    <Tooltip formatter={v => STATES[v]} labelFormatter={l => `t=${l}`} contentStyle={tooltipStyle} />
                    <Area type="stepAfter" dataKey="stateVal" stroke="#00ccff" fill="#00ccff22" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "#6a7a8a", fontSize: 16 }}>
                  Press START LIVE to begin real-time simulation
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
              <div style={glassCard}>
                <h3 style={{ margin: "0 0 16px", color: "#ffaa00", fontSize: 15, letterSpacing: 2 }}>
                  STATE PATH — MONTE CARLO ({simSteps} steps)
                </h3>
                {simChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={simChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a2a3a" />
                      <XAxis dataKey="t" stroke="#4a5a6a" fontSize={12} />
                      <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} stroke="#4a5a6a" fontSize={12} tickFormatter={v => ["N","H","O","D"][v] || v} />
                      <Tooltip formatter={v => STATES[v]} labelFormatter={l => `Step ${l}`} contentStyle={tooltipStyle} />
                      <Area type="stepAfter" dataKey="state" stroke="#00ccff" fill="#00ccff22" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#6a7a8a", fontSize: 15 }}>
                    Click RUN to generate simulation data
                  </div>
                )}
              </div>
              <div style={glassCard}>
                <h3 style={{ margin: "0 0 16px", color: "#aa88ff", fontSize: 15, letterSpacing: 2 }}>SIM vs THEORETICAL</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={freqData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2a3a" />
                    <XAxis dataKey="name" stroke="#4a5a6a" fontSize={12} />
                    <YAxis stroke="#4a5a6a" fontSize={12} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Bar dataKey="simFreq" name="Simulation %" radius={[4,4,0,0]}>
                      {freqData.map((_, i) => <Cell key={i} fill={STATE_COLORS[i]} opacity={0.85} />)}
                    </Bar>
                    <Bar dataKey="theoretical" name="Theoretical %" radius={[4,4,0,0]}>
                      {freqData.map((_, i) => <Cell key={i} fill={STATE_COLORS[i]} opacity={0.4} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* POISSON TAB                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "poisson" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 24 }}>
              <div style={glassCard}>
                <h3 style={{ margin: "0 0 6px", color: "#00ccff", fontSize: 15, letterSpacing: 2 }}>POISSON DISTRIBUTION — P(X=k)</h3>
                <p style={{ color: "#ccd8e0", fontSize: 14, marginBottom: 20 }}>
                  Probability of k connection requests in one minute with λ={lambda}
                </p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={poissonData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2a3a" />
                    <XAxis dataKey="k" stroke="#4a5a6a" fontSize={12} label={{ value: "Arrivals k", position: "insideBottom", offset: -5, fill: "#ccd8e0", fontSize: 13 }} />
                    <YAxis stroke="#4a5a6a" fontSize={12} tickFormatter={v => `${v}%`} label={{ value: "Probability (%)", angle: -90, position: "insideLeft", fill: "#ccd8e0", fontSize: 13 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => `${v}%`} labelFormatter={l => `k = ${l} arrivals`} />
                    <Bar dataKey="probability" name="P(X=k) %" fill="#00ccff" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={glassCard}>
                  <h3 style={{ margin: "0 0 16px", color: "#ffaa00", fontSize: 15, letterSpacing: 2 }}>DISTRIBUTION STATS</h3>
                  {[
                    ["Mean E[X]", `${lambda} arrivals/min`],
                    ["Variance Var[X]", `${lambda}`],
                    ["Std Dev σ", `${Math.sqrt(lambda).toFixed(2)}`],
                    ["Mode", `${Math.max(0, lambda - 1)}`],
                    ["Process Type", "Memoryless (Markov)"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.1)", fontSize: 14 }}>
                      <span style={{ color: "#ccd8e0" }}>{k}</span>
                      <span style={{ color: "#00ccff", fontWeight: 700 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={glassCard}>
                  <h3 style={{ margin: "0 0 12px", color: "#aa88ff", fontSize: 15, letterSpacing: 2 }}>PMF FORMULA</h3>
                  <div style={{ background: "#0d1a26", borderRadius: 10, padding: "18px", textAlign: "center", fontSize: 17, color: "white", letterSpacing: 1 }}>
                    <div style={{ color: "#ccd8e0", fontSize: 13, marginBottom: 10 }}>Poisson PMF:</div>
                    <div>
                      P(X=k) = <span style={{ color: "#ffaa00" }}>e<sup>-λ</sup></span>
                      {" · "}<span style={{ color: "#00ccff" }}>λ<sup>k</sup></span>
                      {" / "}<span style={{ color: "#aa88ff" }}>k!</span>
                    </div>
                    <div style={{ marginTop: 14, color: "#ccd8e0", fontSize: 14 }}>λ = {lambda}, X ~ Poisson({lambda})</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ANALYSIS TAB                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "analysis" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <div style={glassCard}>
                <h3 style={{ margin: "0 0 6px", color: "#ff6600", fontSize: 15, letterSpacing: 2 }}>OVERLOAD PROBABILITY vs λ</h3>
                <p style={{ color: "#ccd8e0", fontSize: 13, marginBottom: 16 }}>How overload risk grows with arrival rate</p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={Array.from({ length: 20 }, (_, i) => {
                    const l = 10 + i * 10;
                    const pp = stationaryDist(buildTransitionMatrix(l, recoveryP));
                    return { lambda: l, overload: +((pp[2] + pp[3]) * 100).toFixed(2), threshold: 30 };
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2a3a" />
                    <XAxis dataKey="lambda" stroke="#4a5a6a" fontSize={12} label={{ value: "λ", position: "insideBottom", offset: -5, fill: "#ccd8e0" }} />
                    <YAxis stroke="#4a5a6a" fontSize={12} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => `${v}%`} />
                    <Area dataKey="overload" name="Overload %" stroke="#ff4455" fill="#ff445522" strokeWidth={2} dot={false} />
                    <Line dataKey="threshold" name="30% Threshold" stroke="#ffaa00" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={glassCard}>
                <h3 style={{ margin: "0 0 6px", color: "#00ff88", fontSize: 15, letterSpacing: 2 }}>RECOVERY PROB vs SYSTEM HEALTH</h3>
                <p style={{ color: "#ccd8e0", fontSize: 13, marginBottom: 16 }}>Effect of recovery probability on normal-state uptime</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={Array.from({ length: 19 }, (_, i) => {
                    const rp = 0.05 + i * 0.05;
                    const pp = stationaryDist(buildTransitionMatrix(lambda, rp));
                    return { recovery: rp.toFixed(2), normal: +(pp[0] * 100).toFixed(1), down: +(pp[3] * 100).toFixed(1) };
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2a3a" />
                    <XAxis dataKey="recovery" stroke="#4a5a6a" fontSize={12} label={{ value: "Recovery P", position: "insideBottom", offset: -5, fill: "#ccd8e0" }} />
                    <YAxis stroke="#4a5a6a" fontSize={12} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Line dataKey="normal" name="Normal State %" stroke="#00ff88" strokeWidth={2} dot={false} />
                    <Line dataKey="down" name="Down State %" stroke="#ff2255" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={glassCard}>
              <h3 style={{ margin: "0 0 16px", color: "#00ccff", fontSize: 15, letterSpacing: 2 }}>PRACTICAL RECOMMENDATIONS</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
                {[
                  { title: "Infrastructure",      color: "#00ccff", body: `Current λ=${lambda} req/min. ${lambda > 120 ? "Deploy additional WAPs and segment SSID by floor to reduce per-AP load." : "Current AP density appears adequate for demand."}` },
                  { title: "Capacity Planning",   color: "#ffaa00", body: `Network spends ${(pi[0] * 100).toFixed(0)}% in Normal state. ${pi[0] < 0.5 ? "Urgently upgrade bandwidth — insufficient headroom." : "Plan 20% bandwidth buffer for growth."}` },
                  { title: "Recovery Mechanisms", color: "#aa88ff", body: `Recovery probability ${(recoveryP * 100).toFixed(0)}%. ${recoveryP < 0.4 ? "Implement automated controller failover and DHCP lease reuse to increase recovery speed." : "Recovery rate is healthy — maintain monitoring cadence."}` },
                  { title: "Peak Hour Policy",    color: "#00ff88", body: `Mean time to failure from Normal: ${mfpt[0].toFixed(0)} min. Schedule maintenance outside peak hours (8–10 AM, 12–2 PM, 5–7 PM).` },
                  { title: "QoS Configuration",   color: "#ff6600", body: `Implement traffic shaping: throttle streaming (>2 Mbps/device) when state transitions to S1 (High Load). Prioritize authentication traffic at all times.` },
                  { title: "Alert Thresholds",    color: "#ff2255", body: `Set SNMP alerts at S1 entry (${(pi[1] * 100).toFixed(0)}% expected). Auto-page NOC when overload probability exceeds 30% for >5 consecutive minutes.` },
                ].map(({ title, color, body }) => (
                  <div key={title} className="card-hover" style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${color}44`, borderRadius: 12, padding: "18px" }}>
                    <div style={{ marginBottom: 10 }}>
                      <span style={{ color, fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>{title}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 14, color: "#ccd8e0", lineHeight: 1.7 }}>{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ textAlign: "center", padding: "20px", color: "#6a7a8a", fontSize: 13, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        Stochastic Systems · Markov Chain · Poisson Process · Monte Carlo Simulation · MERN Stack Project
      </div>
    </div>
  );
}