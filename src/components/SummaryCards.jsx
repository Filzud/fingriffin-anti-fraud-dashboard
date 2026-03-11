import { AlertOctagon, Landmark, ShieldCheck, Sparkles } from 'lucide-react'

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
})

function getBand(score) {
  if (score >= 740) return { t: 'Excellent', c: 'text-emerald-300', b: 'border-emerald-400/80' }
  if (score >= 670) return { t: 'Good', c: 'text-violet-300', b: 'border-violet-400/80' }
  if (score >= 580) return { t: 'Fair', c: 'text-amber-300', b: 'border-amber-400/80' }
  return { t: 'Poor', c: 'text-rose-300', b: 'border-rose-400/80' }
}

function getRiskTone(risk) {
  if (risk === 'High') return 'text-rose-300'
  if (risk === 'Medium') return 'text-amber-300'
  return 'text-emerald-300'
}

function Gauge({ score }) {
  const min = 300
  const max = 850
  const clamped = Math.min(Math.max(score, min), max)
  const p = ((clamped - min) / (max - min)) * 100
  const band = getBand(clamped)

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-zinc-400">Credit Score</p>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${band.b} ${band.c}`}>
          <Sparkles className="h-3 w-3" />
          {band.t}
        </span>
      </div>

      <div className="mt-3 flex flex-col items-center">
        <div className="relative h-24 w-48 overflow-hidden">
          <div className="absolute inset-x-0 bottom-0 h-48 rounded-t-full border-[12px] border-white/10 border-b-0" />
          <div className="absolute inset-x-0 bottom-0 h-48 rounded-t-full border-[12px] border-violet-400/70 border-b-0" style={{ clipPath: `inset(0 ${100 - p}% 0 0)` }} />
          <div className="absolute inset-x-0 bottom-0 h-2 bg-gradient-to-r from-rose-400/40 via-amber-300/40 to-emerald-300/40" />
          <div className="absolute bottom-1 left-[6%] h-1.5 w-1.5 rounded-full bg-white/30" />
          <div className="absolute bottom-3 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/30" />
          <div className="absolute bottom-1 right-[6%] h-1.5 w-1.5 rounded-full bg-white/30" />
          <div className="absolute inset-x-0 bottom-0 mx-auto h-20 w-40 rounded-t-full bg-bg" />
          <div className="absolute bottom-2 left-1/2 h-[70px] w-0.5 -translate-x-1/2 origin-bottom bg-zinc-100/80" style={{ transform: `translateX(-50%) rotate(${-90 + (p * 180) / 100}deg)` }} />
          <div className="absolute bottom-[6px] left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-white/20 bg-zinc-100/90" />
        </div>

        <p className="-mt-2 text-3xl font-semibold text-zinc-100">{clamped}</p>
        <div className="mt-1 flex w-full items-center justify-between px-3 text-[10px] uppercase tracking-wide text-zinc-500">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
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

function SummaryCards({ ai, items, risk, riskScore, riskTrend, score, suspCount }) {
  const total = items.reduce((sum, t) => sum + t.amount, 0)

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

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="glass-panel p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-400">Total Balance</p>
          <div className="mt-2 flex items-center justify-between">
            <p className={total >= 0 ? 'text-2xl font-semibold text-emerald-300' : 'text-2xl font-semibold text-rose-300'}>
              {fmt.format(total)}
            </p>
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

        <Gauge score={score} />
      </div>

      <article className="glass-panel p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-zinc-200">AI Risk Analysis</h3>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${risk === 'Low' ? 'border-emerald-400/60 text-emerald-300' : risk === 'Medium' ? 'border-amber-400/60 text-amber-300' : 'border-rose-400/60 text-rose-300'}`}>
            {risk} Risk
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300">{ai}</p>
        <RiskTrend data={riskTrend} />
      </article>

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
