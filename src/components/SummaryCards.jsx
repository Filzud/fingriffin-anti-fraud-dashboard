import { useEffect, useMemo, useState } from 'react'
import {
  AlertOctagon,
  BellRing,
  ChevronDown,
  ChevronUp,
  Landmark,
  ShieldCheck,
  UserRound
} from 'lucide-react'

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
})

const timeFmt = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit'
})

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

function getRiskTone(risk) {
  if (risk === 'High') return 'text-rose-300'
  if (risk === 'Medium') return 'text-amber-300'
  return 'text-emerald-300'
}

function getFraudTone(score) {
  if (score >= 71) {
    return {
      t: 'High',
      c: 'text-rose-200',
      b: 'border-rose-400/70 bg-rose-500/15',
      s: '#fb7185'
    }
  }

  if (score >= 31) {
    return {
      t: 'Medium',
      c: 'text-amber-200',
      b: 'border-amber-400/70 bg-amber-500/15',
      s: '#facc15'
    }
  }

  return {
    t: 'Low',
    c: 'text-emerald-200',
    b: 'border-emerald-400/70 bg-emerald-500/15',
    s: '#34d399'
  }
}

function getSevTone(sev) {
  if (sev === 'High') return 'border-rose-400/70 bg-rose-500/15 text-rose-200'
  if (sev === 'Medium') return 'border-amber-400/70 bg-amber-500/15 text-amber-200'
  return 'border-emerald-400/70 bg-emerald-500/15 text-emerald-200'
}

function getConfidenceTone(level) {
  if (level === 'High') return 'border-rose-400/60 text-rose-300'
  if (level === 'Medium') return 'border-amber-400/60 text-amber-300'
  return 'border-emerald-400/60 text-emerald-300'
}

function normalizeFactor(flag, tx) {
  const low = (flag || '').toLowerCase()

  if (low.includes('amount')) {
    return { id: 'amount', name: 'Amount anomaly' }
  }

  if (low.includes('merchant') || low.includes('unknown')) {
    return { id: 'merchant', name: 'Unknown merchant' }
  }

  if (low.includes('category') || low.includes('spending pattern')) {
    return { id: 'category', name: 'Unusual category' }
  }

  if (low.includes('location') || low.includes('region')) {
    return { id: 'location', name: 'Location anomaly' }
  }

  if (tx.fraudState === 'frozen') {
    return { id: 'workflow', name: 'Frozen workflow risk' }
  }

  if (tx.fraudState === 'review') {
    return { id: 'workflow', name: 'Manual review workflow' }
  }

  return { id: low || 'risk', name: flag || 'General anomaly' }
}

function getFactorSeverity(factorId, tx) {
  if (tx.fraudState === 'frozen') return 'High'

  if (factorId === 'location') return 'High'

  if (factorId === 'amount') {
    return Math.abs(tx.amount) >= 2200 ? 'High' : 'Medium'
  }

  return 'Medium'
}

function getTxTs(tx) {
  if (Number.isFinite(tx.stateTs)) return tx.stateTs
  const dayTs = new Date(`${tx.date}T00:00:00`).getTime()
  return Number.isFinite(dayTs) ? dayTs : 0
}

function getRecActionTone(level) {
  if (level === 'high') {
    return 'border-rose-400/55 bg-rose-500/15 text-rose-100'
  }

  if (level === 'medium') {
    return 'border-amber-400/55 bg-amber-500/15 text-amber-100'
  }

  return 'border-violet-400/45 bg-violet-500/15 text-violet-100'
}

function getRecAction(tx) {
  if (!tx) return null

  const f = (tx.flags || []).map((x) => x.toLowerCase())
  const amountDeviation = f.some((x) => x.includes('amount'))
  const newMerchant = f.some((x) => x.includes('merchant') || x.includes('unknown'))
  const unusualCategory = f.some((x) => x.includes('category') || x.includes('spending pattern'))

  const signals = [
    amountDeviation ? 'Amount deviation' : null,
    newMerchant ? 'New merchant' : null,
    unusualCategory ? 'Unusual category' : null
  ].filter(Boolean)

  if ((amountDeviation && newMerchant) || (newMerchant && unusualCategory)) {
    return {
      level: 'high',
      action: 'Freeze transaction',
      note: 'Combined anomaly signals indicate elevated fraud likelihood. Freeze immediately and keep funds on hold until identity and payment intent are verified.',
      signals
    }
  }

  if (newMerchant || unusualCategory) {
    return {
      level: 'medium',
      action: 'Request verification',
      note: 'Behavior differs from baseline patterns. Trigger customer verification before final approval.',
      signals
    }
  }

  if (amountDeviation) {
    return {
      level: 'low',
      action: 'Review manually',
      note: 'Amount deviation is present without additional strong anomalies. Route to analyst review for confirmation.',
      signals
    }
  }

  return {
    level: 'low',
    action: 'Review manually',
    note: 'Suspicious workflow remains active. Keep under manual review until anomaly confidence stabilizes.',
    signals: tx.flags?.length ? ['Workflow anomaly'] : []
  }
}

function FraudGauge({ score }) {
  const v = clamp(Math.round(score), 0, 100)
  const tone = getFraudTone(v)

  const size = 136
  const stroke = 11
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r

  const green = c * 0.3
  const yellow = c * 0.4
  const prog = (v / 100) * c

  return (
    <article className="glass-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-zinc-400">Fraud Score</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.b} ${tone.c}`}>
          {tone.t} Risk
        </span>
      </div>

      <div className="mt-3 flex flex-col items-center">
        <div className="relative h-36 w-36">
          <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              r={r}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              r={r}
              stroke="#34d399"
              strokeDasharray={`${green} ${c - green}`}
              strokeDashoffset={0}
              strokeLinecap="round"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              r={r}
              stroke="#facc15"
              strokeDasharray={`${yellow} ${c - yellow}`}
              strokeDashoffset={-green}
              strokeLinecap="round"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              r={r}
              stroke="#fb7185"
              strokeDasharray={`${green} ${c - green}`}
              strokeDashoffset={-(green + yellow)}
              strokeLinecap="round"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              r={r}
              stroke={tone.s}
              strokeDasharray={`${prog} ${c}`}
              strokeLinecap="round"
              strokeWidth={4}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-3xl font-semibold text-zinc-100">{v}</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">0–100</p>
          </div>
        </div>

        <div className="mt-2 flex w-full items-center justify-between text-[10px] uppercase tracking-wide text-zinc-500">
          <span>Green 0–30</span>
          <span>Yellow 31–70</span>
          <span>Red 71–100</span>
        </div>
      </div>
    </article>
  )
}

function RiskTimeline({ points }) {
  const rows = points.slice(-24)
  const last = rows[rows.length - 1]
  const prev = rows[Math.max(rows.length - 2, 0)]
  const diff = last && prev ? last.score - prev.score : 0

  const graph = useMemo(() => {
    if (!rows.length) return { line: '', dots: [] }

    const w = 240
    const h = 72
    const pad = 6
    const steps = Math.max(rows.length - 1, 1)

    const dots = rows.map((p, i) => {
      const x = pad + (i / steps) * (w - pad * 2)
      const y = pad + ((100 - p.score) / 100) * (h - pad * 2)
      return { id: p.id || `${p.ts}-${i}`, x, y, score: p.score }
    })

    return {
      line: dots.map((d) => `${d.x},${d.y}`).join(' '),
      dots
    }
  }, [rows])

  return (
    <article className="mt-4 rounded-xl border border-violet-400/25 bg-violet-500/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase tracking-wider text-violet-200">Risk Timeline</h4>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-zinc-400">
          <span>{rows.length} points</span>
          <span className={diff > 0 ? 'text-rose-300' : diff < 0 ? 'text-emerald-300' : 'text-zinc-400'}>
            {diff > 0 ? '+' : ''}{diff}
          </span>
        </div>
      </div>

      <div className="relative h-20 overflow-hidden rounded-lg border border-white/10 bg-black/20 px-1 py-1">
        <svg aria-label="Risk score timeline" className="h-full w-full" viewBox="0 0 240 72" role="img">
          <path d="M6 48 H234" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <path d="M6 28 H234" stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" strokeWidth="1" />
          {graph.line && (
            <polyline
              fill="none"
              points={graph.line}
              stroke="#8B5CF6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.25"
            />
          )}
          {graph.dots.map((d, i) => {
            const active = i === graph.dots.length - 1
            return (
              <circle
                key={d.id}
                cx={d.x}
                cy={d.y}
                fill={active ? '#fb7185' : '#a78bfa'}
                r={active ? 2.8 : 2.1}
              />
            )
          })}
        </svg>
      </div>
    </article>
  )
}

function RiskTrend({ data }) {
  const max = Math.max(...data, 1)

  return (
    <article className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-300">Fraud Risk Trend</h4>
        <span className="text-[10px] text-zinc-500">Last {data.length} points</span>
      </div>

      <div className="flex h-20 items-end gap-1.5">
        {data.map((v, i) => {
          const h = `${Math.max((v / max) * 100, 8)}%`
          const active = i === data.length - 1
          return (
            <div
              key={`${i}-${v}`}
              className={[
                'flex-1 rounded-sm transition-all',
                active ? 'bg-rose-400/90 shadow-[0_0_16px_rgba(251,113,133,0.35)]' : 'bg-violet-400/55'
              ].join(' ')}
              style={{ height: h }}
              title={`Risk: ${v}`}
            />
          )
        })}
      </div>
    </article>
  )
}

function TopList({ rows, emptyText }) {
  if (!rows.length) {
    return <p className="text-xs text-zinc-500">{emptyText}</p>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((r) => (
        <span
          key={r.name}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300"
        >
          <span>{r.name}</span>
          <span className="text-zinc-500">({r.count})</span>
        </span>
      ))}
    </div>
  )
}

function BehaviorCard({ profile, profileMsg }) {
  return (
    <article className="glass-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-200">User Behavior Profile</h3>
        <UserRound className="h-4 w-4 text-violet-300" />
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400">Average Transaction Amount</p>
        <p className="mt-1 text-xl font-semibold text-violet-200">{fmt.format(-profile.avg)}</p>
        <p className="mt-1 text-[11px] text-zinc-500">Based on {profile.sampleSize} regular outgoing transactions</p>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-400">Most Common Spending Categories</p>
          <TopList rows={profile.cats} emptyText="Not enough spending history yet" />
        </div>

        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-400">Typical Merchants</p>
          <TopList rows={profile.merchants} emptyText="No recurring merchants detected" />
        </div>
      </div>

      {profileMsg && (
        <div className="mt-3 rounded-xl border border-rose-400/50 bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-100">
          {profileMsg}
        </div>
      )}
    </article>
  )
}

function ExplainRiskCard({ rows, tx }) {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    setOpen(Boolean(tx))
  }, [tx])

  return (
    <article className="mt-4 rounded-xl border border-violet-400/25 bg-violet-500/10 p-3">
      <button
        aria-controls="explain-risk-content"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((s) => !s)}
        type="button"
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-violet-300">Explain Risk</p>
          <p className="mt-1 text-xs text-zinc-300">
            {tx
              ? `${tx.merchant} • ${tx.category}`
              : 'Select a suspicious, review, or frozen transaction to see risk rules'}
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-violet-200" /> : <ChevronDown className="h-4 w-4 text-violet-200" />}
      </button>

      {open && (
        <div className="mt-3" id="explain-risk-content">
          {tx ? (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">{r.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{r.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500">No selected transaction.</p>
          )}
        </div>
      )}
    </article>
  )
}

function FraudAlertsCard({ rows, fallback }) {
  return (
    <article className="glass-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-200">Fraud Alerts Today</h3>
        <BellRing className="h-4 w-4 text-violet-300" />
      </div>

      <p className="mt-1 text-xs text-zinc-400">
        {fallback ? 'No alerts generated today. Showing latest risk events.' : 'Recent risk events generated from suspicious transactions.'}
      </p>

      <div className="mt-3 space-y-2.5">
        {rows.length ? rows.map((a) => (
          <div key={a.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-zinc-400">{timeFmt.format(a.ts)}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getSevTone(a.sev)}`}>
                {a.sev}
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-zinc-200">{a.reason}</p>
            <p className="mt-1 text-xs text-zinc-400">{a.text}</p>
          </div>
        )) : (
          <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-500">
            No fraud alerts detected in the current dataset.
          </p>
        )}
      </div>
    </article>
  )
}

function TopRiskFactorsCard({ rows }) {
  return (
    <article className="glass-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-200">Top Risk Factors</h3>
        <span className="rounded-full border border-violet-400/40 bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
          Recent Suspicious
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {rows.length ? rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-zinc-200">{r.name}</p>
              <p className="text-[11px] text-zinc-500">Detected in {r.count} recent transaction{r.count === 1 ? '' : 's'}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getSevTone(r.sev)}`}>
              {r.sev}
            </span>
          </div>
        )) : (
          <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-500">
            No active suspicious anomalies to summarize.
          </p>
        )}
      </div>
    </article>
  )
}

function SummaryCards({
  ai,
  aiConfidence,
  alertsFallback,
  balance,
  fraudAlerts,
  fraudScore,
  holdAmount,
  items,
  profile,
  profileMsg,
  risk,
  riskExplain,
  riskScore,
  riskTimeline,
  riskTrend,
  selTx,
  suspCount
}) {
  const byCat = items
    .filter((t) => t.amount < 0)
    .reduce((acc, t) => {
      const key = t.category
      const val = Math.abs(t.amount)
      acc[key] = (acc[key] || 0) + val
      return acc
    }, {})

  const catRows = Object.entries(byCat)
  const max = Math.max(...catRows.map(([, v]) => v), 1)

  const topRiskFactors = useMemo(() => {
    const recent = items
      .filter((t) => t.fraudState === 'suspicious' || t.fraudState === 'review' || t.fraudState === 'frozen')
      .sort((a, b) => getTxTs(b) - getTxTs(a))
      .slice(0, 8)

    const map = recent.reduce((acc, t) => {
      const rawFactors = t.flags && t.flags.length
        ? t.flags
        : [t.fraudState === 'frozen' ? 'Frozen workflow risk' : 'Manual review workflow']

      rawFactors.forEach((f) => {
        const normalized = normalizeFactor(f, t)
        const sev = getFactorSeverity(normalized.id, t)

        if (!acc[normalized.id]) {
          acc[normalized.id] = {
            id: normalized.id,
            name: normalized.name,
            count: 0,
            sev: 'Medium'
          }
        }

        acc[normalized.id].count += 1
        if (sev === 'High') {
          acc[normalized.id].sev = 'High'
        }
      })

      return acc
    }, {})

    return Object.values(map)
      .sort((a, b) => {
        if (a.sev !== b.sev) return a.sev === 'High' ? -1 : 1
        if (a.count !== b.count) return b.count - a.count
        return a.name.localeCompare(b.name)
      })
      .slice(0, 5)
  }, [items])

  const latestSuspTx = useMemo(() => {
    const rows = items
      .filter((t) => t.fraudState === 'suspicious' || t.fraudState === 'review' || t.fraudState === 'frozen')
      .sort((a, b) => getTxTs(b) - getTxTs(a))

    return rows[0] || null
  }, [items])

  const recAction = useMemo(() => getRecAction(latestSuspTx), [latestSuspTx])

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="glass-panel p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-400">Available Balance</p>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className={balance >= 0 ? 'text-2xl font-semibold text-emerald-300' : 'text-2xl font-semibold text-rose-300'}>
                {fmt.format(balance)}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">Held for review/freeze: {fmt.format(-holdAmount)}</p>
            </div>
            <Landmark className="h-5 w-5 text-violet-300" />
          </div>
        </article>

        <article className="glass-panel p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-400">Risk Level</p>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className={`text-2xl font-semibold ${getRiskTone(risk)}`}>{risk}</p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {suspCount} suspicious {suspCount === 1 ? 'transaction' : 'transactions'}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">Risk Score: {riskScore}</p>
            </div>
            {risk === 'Low' ? (
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            ) : (
              <AlertOctagon className={`h-5 w-5 ${risk === 'Medium' ? 'text-amber-300' : 'text-rose-300'}`} />
            )}
          </div>
        </article>

        <FraudGauge score={fraudScore} />
      </div>

      <article className="glass-panel p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-zinc-200">AI Risk Analysis</h3>
          <div className="flex items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getConfidenceTone(aiConfidence.level)}`}>
              Confidence: {aiConfidence.level}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${risk === 'Low' ? 'border-emerald-400/60 text-emerald-300' : risk === 'Medium' ? 'border-amber-400/60 text-amber-300' : 'border-rose-400/60 text-rose-300'}`}>
              {risk} Risk
            </span>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300">{ai}</p>
        <RiskTimeline points={riskTimeline} />

        {recAction && (
          <section className={`mt-4 rounded-xl border p-3 ${getRecActionTone(recAction.level)}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.15em] text-current/85">Recommended Action</p>
                <p className="mt-1 text-sm font-semibold text-current">{recAction.action}</p>
              </div>
              <span className="rounded-full border border-current/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-current/85">
                {latestSuspTx?.fraudState || 'suspicious'}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-current/90">{recAction.note}</p>
            {recAction.signals.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recAction.signals.map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-current/25 bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-current/90"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        <RiskTrend data={riskTrend} />
        <ExplainRiskCard rows={riskExplain} tx={selTx} />
      </article>

      <FraudAlertsCard fallback={alertsFallback} rows={fraudAlerts} />

      <TopRiskFactorsCard rows={topRiskFactors} />

      <BehaviorCard profile={profile} profileMsg={profileMsg} />

      <article className="glass-panel p-4">
        <h3 className="text-sm font-medium text-zinc-200">Spending by Category</h3>
        <div className="mt-4 space-y-3">
          {catRows.map(([cat, val]) => {
            const w = `${Math.max((val / max) * 100, 8)}%`
            return (
              <div key={cat} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-zinc-300">
                  <span>{cat}</span>
                  <span>{fmt.format(-val)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-rose-400/80" style={{ width: w }} />
                </div>
              </div>
            )
          })}
        </div>
      </article>
    </section>
  )
}

export default SummaryCards
