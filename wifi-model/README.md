# University WiFi Load & Failure Model

A stochastic systems simulation tool that models university WiFi network behavior using a 4-state Markov chain with Poisson arrivals, Monte Carlo simulation, and real-time state analysis.

---

## Overview

This project applies probability theory and stochastic processes to model how a university WiFi network transitions between load states. It computes stationary distributions, mean first passage times, and overload risk — and lets you visualize them interactively in the browser.

Built as a full-stack MERN-adjacent project (React + Express), with all math running in both the frontend and a separate backend API.

---

## Features

| Tab | What it shows |
|---|---|
| **Overview** | Transition matrix P, stationary distribution π, MFPT, network status alert |
| **Markov Chain** | SVG state-transition diagram with live state highlight, π pie chart |
| **Simulation** | Live step-by-step simulation + Monte Carlo batch run vs. theoretical |
| **Poisson** | PMF bar chart for P(X=k) at current λ, distribution statistics |
| **Analysis** | Overload probability vs. λ curve, recovery probability sensitivity, recommendations |

---

## Model

### States

| State | Label | Description |
|---|---|---|
| S0 | Normal | Network operating nominally |
| S1 | High Load | Elevated traffic, degraded throughput |
| S2 | Overloaded | Critical congestion, significant packet loss |
| S3 | Down | Network failure / full outage |

### Parameters

| Parameter | Symbol | Default | Range |
|---|---|---|---|
| Arrival rate | λ | 80 req/min | 10 – 200 |
| Recovery probability | P_recovery | 0.30 | 0.05 – 0.95 |
| Simulation steps | — | 200 | 50 – 1000 |

### Math

- **Transition Matrix** — Built from λ and recovery probability; row-stochastic 4×4 matrix
- **Stationary Distribution π** — Power iteration (converges in ≤ 2000 iterations to 1e-9 tolerance)
- **Mean First Passage Time** — Value iteration to compute E[steps to reach state j from state i]
- **Poisson PMF** — P(X=k) = e^(−λ) · λ^k / k! via log-space computation to avoid overflow
- **Monte Carlo** — Discrete-time Markov chain walk with Poisson-sampled arrivals per step

---

## Tech Stack

**Frontend**
- React 19 + Vite 8
- Recharts 3 (AreaChart, BarChart, LineChart, PieChart)
- All math self-contained in `App.jsx` — no backend required to run the UI

**Backend** (optional, mirrors frontend math as a REST API)
- Node.js + Express 5
- CORS-enabled
- Stateless — no database

---

## Project Structure

```
wifi-model/
├── src/
│   ├── App.jsx          # Main component — all math, charts, and UI
│   ├── App.css          # Component-scoped styles
│   ├── index.css        # Global styles and CSS variables
│   └── main.jsx         # React entry point
├── backend/
│   ├── server.js        # Express API server
│   └── package.json
├── index.html
├── vite.config.js
├── eslint.config.js
└── package.json
```

---

## Getting Started

### Frontend

```bash
cd wifi-model
npm install
npm run dev
```

Runs on `http://localhost:5173` by default.

### Backend (optional)

```bash
cd wifi-model/backend
npm install
node server.js
```

Runs on `http://localhost:5000`.

---

## API Endpoints

All endpoints are `GET` unless noted.

### `GET /api/model`

Returns transition matrix, stationary distribution, MFPT, overload probability, and a recommendation string.

**Query params:** `lambda` (default 80), `recoveryP` (default 0.3)

```json
{
  "params": { "lambda": 80, "recoveryP": 0.3 },
  "transitionMatrix": [[...], ...],
  "stationaryDistribution": [0.42, 0.31, 0.18, 0.09],
  "meanFirstPassageTime": [12.4, 0, 8.1, 21.7],
  "overloadProbability": 0.27,
  "recommendation": "WARNING: Plan bandwidth expansion..."
}
```

### `GET /api/poisson`

Returns PMF values for P(X=k) up to `maxK`.

**Query params:** `lambda` (default 80), `maxK` (default 30)

### `POST /api/simulate`

Runs a Monte Carlo simulation server-side.

**Body:** `{ lambda, recoveryP, steps }` — max 5000 steps

Returns step history, state counts, empirical frequencies, theoretical distribution, and MSE.

### `GET /api/sensitivity`

Sweeps λ from 10 to 200 (step 10) at a fixed `recoveryP` and returns per-λ stationary distribution and MFPT values.

**Query params:** `recoveryP` (default 0.3)

---

## Alerts

The Overview tab automatically displays a status banner based on computed overload probability:

| Condition | Status |
|---|---|
| P(overload) > 30% | 🔴 CRITICAL — bandwidth upgrade required |
| 15% < P(overload) ≤ 30% | 🟡 WARNING — monitor and plan expansion |
| P(overload) ≤ 15% | 🟢 STABLE — within safe operating limits |

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint across all `.js` / `.jsx` files |
