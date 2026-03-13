import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ShieldCheck, ShieldX, TrendingUp, X } from 'lucide-react'
import { useEffect } from 'react'

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

function getScoreZone(score) {
  if (score >= 71) {
    return {
      label: 'Red Zone',
      range: '71–100',
      tone: 'border-rose-400/70 bg-rose-500/15 text-rose-200'
    }
  }

  if (score >= 31) {
    return {
      label: 'Yellow Zone',
      range: '31–70',
      tone: 'border-amber-400/70 bg-amber-500/15 text-amber-200'
    }
  }

  return {
    label: 'Green Zone',
    range: '0–30',
    tone: 'border-emerald-400/70 bg-emerald-500/15 text-emerald-200'
  }
}

function getActionTone(priority) {
  if (priority === 'high') {
    return {
      box: 'border-rose-400/50 bg-rose-500/10',
      icon: <ShieldX className="h-4 w-4 text-rose-300" />
    }
  }

  if (priority === 'medium') {
    return {
      box: 'border-amber-400/50 bg-amber-500/10',
      icon: <AlertTriangle className="h-4 w-4 text-amber-300" />
    }
  }

  return {
    box: 'border-emerald-400/50 bg-emerald-500/10',
    icon: <ShieldCheck className="h-4 w-4 text-emerald-300" />
  }
}

function TrendBars({ data }) {
  const max = Math.max(...data, 1)

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Risk Trend</p>
        <span className="text-[10px] text-zinc-500">Last {data.length} points</span>
      </div>
      <div className="flex h-24 items-end gap-1.5">
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
              title={`Risk score: ${v}`}
            />
          )
        })}
      </div>
    </div>
  )
}

function RiskReportModal({
  open,
  onClose,
  fraudScore,
  suspiciousCount,
  unusualMerchants,
  riskTrend,
  recActions
}) {
  const score = clamp(Math.round(fraudScore), 0, 100)
  const zone = getScoreZone(score)

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.section
            animate={{ opacity: 1, y: 0, scale: 1 }}
            aria-label="Generated risk report"
            aria-modal="true"
            className="glass-panel w-full max-w-3xl border-violet-400/40 p-4 sm:p-5"
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-violet-300">Generate Risk Report</p>
                <h3 className="mt-1 text-base font-semibold text-zinc-100">Current fraud-risk situation summary</h3>
                <p className="mt-1 text-xs text-zinc-400">Live report derived from the current anti-fraud workflow state.</p>
              </div>
              <button
                aria-label="Close risk report"
                className="rounded-md border border-white/20 p-1 text-zinc-300 transition hover:bg-white/10"
                onClick={onClose}
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <article className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Fraud Score</p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <p className="text-3xl font-semibold text-zinc-100">{score}</p>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${zone.tone}`}>
                    {zone.label} ({zone.range})
                  </span>
                </div>
              </article>

              <article className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Suspicious Transactions</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-3xl font-semibold text-amber-200">{suspiciousCount}</p>
                  <TrendingUp className="h-5 w-5 text-violet-300" />
                </div>
              </article>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-zinc-400">Unusual Merchants</p>
              {unusualMerchants.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {unusualMerchants.map((m) => (
                    <span
                      key={m.name}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-100"
                    >
                      <span>{m.name}</span>
                      <span className="text-rose-200/70">({m.count})</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No unusual merchants are currently present in suspicious workflow states.</p>
              )}
            </div>

            <TrendBars data={riskTrend} />

            <div className="mt-3">
              <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-zinc-400">Recommended Actions</p>
              <div className="space-y-2">
                {recActions.map((a) => {
                  const tone = getActionTone(a.priority)
                  return (
                    <div key={a.id} className={`rounded-xl border px-3 py-2 ${tone.box}`}>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5">{tone.icon}</span>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">{a.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-zinc-300">{a.text}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default RiskReportModal
