"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ModelSplit {
  model: string;
  queries: number;
  pct: number;
  costUsd: number;
}
interface QueryRollup {
  runId: string;
  model: string;
  reason: string;
  distinctDocs: number;
  topScore: number;
  turns: number;
  costUsd: number;
  latencyMsTotal: number;
}
interface Summary {
  generatedAt: string;
  runStartedAt: string;
  queryCount: number;
  totalCostUsd: number;
  avgCostPerQueryUsd: number;
  modelSplit: ModelSplit[];
  routing: {
    byReason: { reason: string; queries: number }[];
    escalationRatePct: number;
  };
  latency: { p50Ms: number; p90Ms: number; maxMs: number };
  cache: { anyCacheHits: boolean; note: string };
  queries: QueryRollup[];
}

const HAIKU = "#4a9d7f"; // Playbook's two models get two stable colors
const SONNET = "#c2683a";
const modelColor = (m: string) => (m.includes("haiku") ? HAIKU : SONNET);
const shortModel = (m: string) => m.replace("claude-", "").replace("-4-5", "").replace("-4-6", "");

export default function Dashboard() {
  const [s, setS] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/summary.json")
      .then((r) => {
        if (!r.ok) throw new Error(`summary.json not found (${r.status})`);
        return r.json();
      })
      .then(setS)
      .catch((e) => setErr(String(e)));
  }, []);

  if (err)
    return (
      <main className="wrap">
        <p className="empty">
          No summary yet. Run <code>npm run aggregate</code> after an eval run to
          generate <code>dashboard/public/summary.json</code>.
        </p>
      </main>
    );
  if (!s) return <main className="wrap"><p className="empty">Loading…</p></main>;

  const costData = s.modelSplit.map((m) => ({
    name: shortModel(m.model),
    cost: m.costUsd,
    model: m.model,
  }));

  return (
    <main className="wrap">
      <header className="head">
        <h1>Playbook — cost &amp; routing</h1>
        <p className="sub">
          {s.queryCount} queries · run of{" "}
          {new Date(s.runStartedAt).toLocaleString()}
        </p>
      </header>

      <section className="cards">
        <Stat label="Total cost" value={`$${s.totalCostUsd.toFixed(4)}`} />
        <Stat label="Avg / query" value={`$${s.avgCostPerQueryUsd.toFixed(4)}`} />
        <Stat
          label="Escalation rate"
          value={`${s.routing.escalationRatePct}%`}
          sub="to Sonnet"
        />
        <Stat label="p90 latency" value={`${(s.latency.p90Ms / 1000).toFixed(1)}s`} />
      </section>

      <section className="grid">
        <Panel title="Model split" subtitle="queries routed to each model">
          <div className="split">
            {s.modelSplit.map((m) => (
              <div key={m.model} className="splitRow">
                <span className="dot" style={{ background: modelColor(m.model) }} />
                <span className="splitName">{shortModel(m.model)}</span>
                <span className="splitBarTrack">
                  <span
                    className="splitBarFill"
                    style={{ width: `${m.pct}%`, background: modelColor(m.model) }}
                  />
                </span>
                <span className="splitPct">
                  {m.queries} · {m.pct}%
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Cost by model" subtitle="total USD, this run">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={costData} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#8a8577" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#8a8577" }} axisLine={false} tickLine={false} width={44}
                tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(v: number) => [`$${v.toFixed(4)}`, "cost"]}
                contentStyle={{ background: "#1c1a17", border: "1px solid #33302a", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#e8e4da" }}
              />
              <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                {costData.map((d) => (
                  <Cell key={d.model} fill={modelColor(d.model)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Why it routed" subtitle="routing reason per query">
          <ul className="reasons">
            {s.routing.byReason.map((r) => (
              <li key={r.reason}>
                <code>{r.reason}</code>
                <span>{r.queries}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Prompt caching" subtitle="cache utilization">
          <p className="cacheNote">{s.cache.note}</p>
        </Panel>
      </section>

      <section className="tableWrap">
        <h2>Per-query</h2>
        <table>
          <thead>
            <tr>
              <th>model</th>
              <th>reason</th>
              <th className="num">docs</th>
              <th className="num">top</th>
              <th className="num">turns</th>
              <th className="num">latency</th>
              <th className="num">cost</th>
            </tr>
          </thead>
          <tbody>
            {s.queries.map((q) => (
              <tr key={q.runId}>
                <td>
                  <span className="dot" style={{ background: modelColor(q.model) }} />
                  {shortModel(q.model)}
                </td>
                <td><code className="reasonCell">{q.reason}</code></td>
                <td className="num">{q.distinctDocs}</td>
                <td className="num">{q.topScore.toFixed(2)}</td>
                <td className="num">{q.turns}</td>
                <td className="num">{(q.latencyMsTotal / 1000).toFixed(1)}s</td>
                <td className="num">${q.costUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="foot">
        Generated {new Date(s.generatedAt).toLocaleString()} · static snapshot
      </footer>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="statValue">{value}</div>
      <div className="statLabel">
        {label}
        {sub && <span className="statSub"> {sub}</span>}
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="panelHead">
        <h3>{title}</h3>
        <span>{subtitle}</span>
      </div>
      {children}
    </div>
  );
}