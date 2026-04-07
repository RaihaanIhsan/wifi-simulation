// server.js — University WiFi Load & Failure Model Backend
// Run: npm install express cors && node server.js

const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());

// ─── MATH ENGINE ─────────────────────────────────────────────────────────────

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
  let pi = [0.25, 0.25, 0.25, 0.25];
  for (let iter = 0; iter < 2000; iter++) {
    const next = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) next[j] += pi[i] * P[i][j];
    if (next.every((v, i) => Math.abs(v - pi[i]) < 1e-9)) { pi = next; break; }
    pi = next;
  }
  return pi;
}

function meanFirstPassage(P, target = 3) {
  const m = [0, 0, 0, 0];
  for (let iter = 0; iter < 1000; iter++) {
    const prev = [...m];
    for (let i = 0; i < 4; i++) {
      if (i === target) { m[i] = 0; continue; }
      m[i] = 1 + P[i].reduce((s, p, j) => s + (j !== target ? p * prev[j] : 0), 0);
    }
    if (m.every((v, i) => Math.abs(v - prev[i]) < 0.01)) break;
  }
  return m;
}

function poissonPMF(lambda, k) {
  const logP = -lambda + k * Math.log(lambda) - lgamma(k + 1);
  return Math.exp(logP);
}

function lgamma(n) { // Stirling approximation
  if (n === 0) return Infinity;
  if (n <= 1) return 0;
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

function poissonSample(lambda) {
  let L = Math.exp(-lambda), k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

function runMonteCarlo(steps, lambda, recoveryP) {
  const P = buildTransitionMatrix(lambda, recoveryP);
  let state = 0;
  const history = [];
  const stateCounts = [0, 0, 0, 0];
  for (let t = 0; t < steps; t++) {
    stateCounts[state]++;
    const arrivals = poissonSample(lambda);
    const r = Math.random(); let cum = 0, next = state;
    for (let j = 0; j < 4; j++) { cum += P[state][j]; if (r < cum) { next = j; break; } }
    history.push({ t, state, arrivals });
    state = next;
  }
  const total = steps;
  return { history, stateCounts, empiricalFreq: stateCounts.map(c => c / total) };
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// GET /api/model?lambda=80&recoveryP=0.3
app.get("/api/model", (req, res) => {
  const lambda = parseFloat(req.query.lambda) || 80;
  const recoveryP = parseFloat(req.query.recoveryP) || 0.3;
  const P = buildTransitionMatrix(lambda, recoveryP);
  const pi = stationaryDist(P);
  const mfpt = meanFirstPassage(P, 3);
  const overloadProb = pi[2] + pi[3];
  const recommendation =
    overloadProb > 0.3 ? "CRITICAL: Increase bandwidth immediately. Overload probability exceeds 30%." :
    overloadProb > 0.15 ? "WARNING: Plan bandwidth expansion. Monitor load patterns." :
    "STABLE: Network operating within safe parameters.";

  res.json({
    params: { lambda, recoveryP },
    transitionMatrix: P,
    stationaryDistribution: pi,
    meanFirstPassageTime: mfpt,
    overloadProbability: overloadProb,
    recommendation,
  });
});

// GET /api/poisson?lambda=80&maxK=30
app.get("/api/poisson", (req, res) => {
  const lambda = parseFloat(req.query.lambda) || 80;
  const maxK = parseInt(req.query.maxK) || 30;
  const pmf = Array.from({ length: maxK + 1 }, (_, k) => ({
    k,
    probability: poissonPMF(lambda, k),
  }));
  res.json({ lambda, mean: lambda, variance: lambda, stdDev: Math.sqrt(lambda), pmf });
});

// POST /api/simulate  body: { lambda, recoveryP, steps }
app.post("/api/simulate", (req, res) => {
  const { lambda = 80, recoveryP = 0.3, steps = 500 } = req.body;
  if (steps > 5000) return res.status(400).json({ error: "Max 5000 steps" });
  const P = buildTransitionMatrix(lambda, recoveryP);
  const pi = stationaryDist(P);
  const result = runMonteCarlo(steps, lambda, recoveryP);
  const mse = result.empiricalFreq.reduce((s, f, i) => s + (f - pi[i]) ** 2, 0) / 4;
  res.json({ ...result, theoreticalDist: pi, mse, steps });
});

// GET /api/sensitivity?recoveryP=0.3
app.get("/api/sensitivity", (req, res) => {
  const recoveryP = parseFloat(req.query.recoveryP) || 0.3;
  const data = Array.from({ length: 20 }, (_, i) => {
    const lambda = 10 + i * 10;
    const P = buildTransitionMatrix(lambda, recoveryP);
    const pi = stationaryDist(P);
    const mfpt = meanFirstPassage(P, 3);
    return { lambda, normalProb: pi[0], highProb: pi[1], overloadProb: pi[2], downProb: pi[3], mfptToFailure: mfpt[0] };
  });
  res.json({ recoveryP, data });
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`WiFi Model API running on http://localhost:${PORT}`));