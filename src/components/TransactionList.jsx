import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  MapPin,
  OctagonAlert,
  ScanSearch,
  ShieldCheck,
  Snowflake
} from 'lucide-react'

const v = {
  hidden: { opacity: 0, y: 10 },
  show: (i) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, delay: i * 0.04, ease: 'easeOut' }
  }),
  exit: { opacity: 0, x: 22, height: 0, marginBottom: 0, transition: { duration: 0.2 } }
}

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
})

const fltOpts = [
  { id: 'all', label: 'All' },
  { id: 'suspicious', label: 'Suspicious' },
  { id: 'frozen', label: 'Frozen' },
  { id: 'approved', label: 'Approved' }
]

function RowIcon({ amount, fraudState, suspicious }) {
  if (fraudState === 'frozen') return <Snowflake className="h-4 w-4 text-rose-200" />
  if (fraudState === 'review') return <ScanSearch className="h-4 w-4 text-amber-200" />
  if (suspicious) return <OctagonAlert className="h-4 w-4 text-rose-300" />
  return amount >= 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-300" /> : <ArrowDownRight className="h-4 w-4 text-rose-300" />
}

function mkTip(flags = []) {
  if (!flags.length) return 'No fraud indicators'
  return flags.join(' • ')
}

function getStateChip(tip, fraudState, suspicious) {
  if (fraudState === 'frozen') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-300/60 bg-rose-950/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-100" title={tip}>
        <Snowflake className="h-3 w-3" />
        FROZEN
      </span>
    )
  }

  if (fraudState === 'review') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-300/40 bg-amber-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100" title={tip}>
        <ScanSearch className="h-3 w-3" />
        Under Review
      </span>
    )
  }

  if (suspicious) {
    return (
      <span className="inline-flex cursor-help items-center gap-1 rounded-md border border-rose-300/40 bg-rose-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-100" title={tip}>
        <AlertTriangle className="h-3 w-3" />
        Suspicious
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
      <ShieldCheck className="h-3 w-3" />
      Secure
    </span>
  )
}

function getRowTone(fraudState, suspicious, locAnomaly) {
  if (fraudState === 'frozen') return 'border-rose-700/90 bg-rose-950/55 shadow-[0_0_0_1px_rgba(127,29,29,0.45)]'
  if (fraudState === 'review') return 'border-amber-500/60 bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.18)]'
  if (suspicious) return 'border-rose-500/70 bg-rose-500/10 shadow-[0_0_0_1px_rgba(244,63,94,0.2)]'
  if (locAnomaly) return 'border-violet-500/60 bg-violet-500/10 shadow-[0_0_0_1px_rgba(139,92,246,0.25)]'
  return 'border-white/10 bg-white/5'
}

function isActionable(t) {
  return t.suspicious || t.fraudState === 'review' || t.fraudState === 'frozen'
}

function getCountryChip(country, locAnomaly, typicalRegion) {
  if (!country) return null

  if (locAnomaly) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border border-violet-300/45 bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-100"
        title={typicalRegion ? `Outside typical region: ${typicalRegion}` : 'Outside typical user region'}
      >
        <MapPin className="h-3 w-3" />
        {country} · Location anomaly
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
      <MapPin className="h-3 w-3" />
      {country}
    </span>
  )
}

function TransactionList({
  analyzingTx,
  approvedCount,
  filter,
  frozenCount,
  items,
  onApprove,
  onFilter,
  onFreeze,
  onInspect,
  onReview,
  suspCount,
  totalCount,
  typicalRegion
}) {
  const cntMap = {
    all: totalCount,
    suspicious: suspCount,
    frozen: frozenCount,
    approved: approvedCount
  }

  return (
    <section className="glass-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-200">Recent Transactions</h2>
        <span className="text-xs text-zinc-400">{items.length} items</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {fltOpts.map((f) => {
          const active = filter === f.id
          const cnt = cntMap[f.id] ?? 0
          return (
            <button
              key={f.id}
              className={[
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition',
                active
                  ? 'border-violet-400/70 bg-violet-500/30 text-violet-100'
                  : 'border-white/15 bg-white/5 text-zinc-300 hover:border-violet-300/40 hover:bg-violet-500/15'
              ].join(' ')}
              onClick={() => onFilter(f.id)}
              type="button"
            >
              <span>{f.label}</span>
              <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px]">{cnt}</span>
            </button>
          )
        })}
      </div>

      <AnimatePresence>
        {analyzingTx && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            aria-live="polite"
            className="mb-2 rounded-xl border border-violet-400/35 bg-violet-500/10 px-3 py-2"
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: -6 }}
            role="status"
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="flex items-center justify-between gap-2 text-xs text-violet-100">
              <span className="inline-flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-300/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-300" />
                </span>
                AI analyzing transaction
              </span>
              <span className="text-violet-200/80">~1s</span>
            </div>
            <p className="mt-1 text-[11px] text-violet-200/85">
              {analyzingTx.merchant} • {fmt.format(analyzingTx.amount)}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {items.map((t, i) => {
            const suspicious = Boolean(t.suspicious)
            const tip = mkTip(t.flags)
            const actionable = isActionable(t)
            const locAnomaly = Boolean(t.locationAnomaly)

            return (
              <motion.li
                key={t.id}
                animate="show"
                className={[
                  'group flex cursor-pointer items-center justify-between overflow-hidden rounded-xl border px-3 py-2 transition hover:border-violet-400/35 hover:bg-violet-500/10',
                  getRowTone(t.fraudState, suspicious, locAnomaly)
                ].join(' ')}
                custom={i}
                exit="exit"
                initial="hidden"
                onClick={() => onInspect(t)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onInspect(t)
                  }
                }}
                role="button"
                tabIndex={0}
                variants={v}
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <RowIcon amount={t.amount} fraudState={t.fraudState} suspicious={suspicious} />
                  </span>
                  <div>
                    <p className="text-sm text-zinc-100">{t.merchant}</p>
                    <p className="text-xs text-zinc-400">{t.category} • {t.date}</p>
                    <div className="mt-1">{getCountryChip(t.country, locAnomaly, typicalRegion)}</div>
                  </div>
                </div>

                <div className="text-right">
                  <p className={t.amount >= 0 ? 'text-sm font-medium text-emerald-300' : 'text-sm font-medium text-rose-300'}>{fmt.format(t.amount)}</p>
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    {getStateChip(tip, t.fraudState, suspicious)}
                    {actionable && (
                      <>
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-rose-300/40 bg-rose-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-100 transition hover:bg-rose-500/30"
                          onClick={(e) => {
                            e.stopPropagation()
                            onFreeze(t.id)
                          }}
                          type="button"
                        >
                          <Snowflake className="h-3 w-3" />
                          Freeze
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300/40 bg-amber-400/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100 transition hover:bg-amber-400/30"
                          onClick={(e) => {
                            e.stopPropagation()
                            onReview(t.id)
                          }}
                          type="button"
                        >
                          <ScanSearch className="h-3 w-3" />
                          Review
                        </button>
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-300/40 bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-500/30"
                          onClick={(e) => {
                            e.stopPropagation()
                            onApprove(t.id)
                          }}
                          type="button"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          Approve
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
    </section>
  )
}

export default TransactionList
