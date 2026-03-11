import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, ShieldAlert, X } from 'lucide-react'
import SummaryCards from './components/SummaryCards'
import TransactionList from './components/TransactionList'
import { transactions } from './data/transactions'

const simTx = {
  merchant: 'Unknown Merchant',
  amount: -2800,
  category: 'Crypto Transfer'
}

const seedTrend = [10, 15, 20, 40, 70, 85]

const mkDate = () => new Date().toISOString().slice(0, 10)
const mkId = () => `t${Date.now()}`

function flagTx(t, hist) {
  const rs = []
  const a = Math.abs(t.amount)

  if (a > 1000) rs.push('Amount exceeds $1,000 threshold')

  const mSet = new Set(hist.map((x) => x.merchant.toLowerCase()))
  const m = t.merchant.toLowerCase()
  if (m.includes('unknown') || !mSet.has(m)) rs.push('Merchant is unknown in account history')

  const cSet = new Set(hist.filter((x) => x.amount < 0).map((x) => x.category.toLowerCase()))
  if (t.amount < 0 && !cSet.has(t.category.toLowerCase())) rs.push('Category is unusual for prior spending pattern')

  const suspicious = rs.length > 0

  return {
    ...t,
    flags: rs,
    suspicious,
    fraudState: suspicious ? 'suspicious' : 'clear'
  }
}

function hydrateTx(list) {
  const out = []
  list.forEach((t) => {
    out.push(flagTx(t, out))
  })
  return out
}

function getRisk(score) {
  if (score >= 75) return 'High'
  if (score >= 40) return 'Medium'
  return 'Low'
}

function getAiText(susp) {
  if (!susp.length) return 'No high-risk anomalies detected. Transaction behavior is stable.'

  const latest = susp[0]
  const why = latest.flags.join(' ')
  return `Unusual spending behavior detected. ${why}.`
}

function getNextRiskPoint(last, inc = 12) {
  return Math.min(last + inc, 100)
}

function isSuspTx(t) {
  return t.suspicious || t.fraudState === 'review' || t.fraudState === 'frozen'
}

function getAiBullets(t) {
  if (!t) return []

  const f = (t.flags || []).map((x) => x.toLowerCase())
  const out = []

  if (f.some((x) => x.includes('amount'))) {
    out.push('Amount exceeds normal spending pattern for this account.')
  }

  if (f.some((x) => x.includes('merchant') || x.includes('unknown'))) {
    out.push('Unknown merchant detected compared to prior transaction history.')
  }

  if (f.some((x) => x.includes('category') || x.includes('spending pattern'))) {
    out.push('Unusual category for this user based on historical behavior.')
  }

  if (!out.length && t.flags?.length) {
    t.flags.forEach((x) => out.push(x))
  }

  if (!out.length) {
    out.push('Pattern deviates from baseline profile and requires additional review.')
  }

  return out
}

function topRows(mapObj, limit = 3) {
  return Object.entries(mapObj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}

function App() {
  const [tx, setTx] = useState(() => hydrateTx(transactions))
  const [al, setAl] = useState(null)
  const [riskTrend, setRiskTrend] = useState(seedTrend)
  const [flt, setFlt] = useState('all')
  const [alertsToday, setAlertsToday] = useState(0)
  const [selTx, setSelTx] = useState(null)
  const [lastSimId, setLastSimId] = useState(null)
  const tRef = useRef(null)

  const riskScore = riskTrend[riskTrend.length - 1] || 0

  const susp = useMemo(
    () => tx.filter((t) => t.suspicious && t.fraudState !== 'clear'),
    [tx]
  )
  const frozenCount = useMemo(
    () => tx.filter((t) => t.fraudState === 'frozen').length,
    [tx]
  )

  const baseTx = useMemo(
    () => tx.filter((t) => t.amount < 0 && t.fraudState === 'clear' && t.type !== 'fraud'),
    [tx]
  )

  const profile = useMemo(() => {
    const count = baseTx.length
    const sum = baseTx.reduce((acc, t) => acc + Math.abs(t.amount), 0)
    const avg = count ? Math.round(sum / count) : 0

    const catMap = baseTx.reduce((acc, t) => {
      const k = t.category
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})

    const merchMap = baseTx.reduce((acc, t) => {
      const k = t.merchant
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})

    return {
      avg,
      sampleSize: count,
      cats: topRows(catMap),
      merchants: topRows(merchMap)
    }
  }, [baseTx])

  const simTxItem = useMemo(
    () => (lastSimId ? tx.find((t) => t.id === lastSimId) || null : null),
    [lastSimId, tx]
  )

  const profileMsg = useMemo(() => {
    if (!simTxItem || !isSuspTx(simTxItem)) return ''

    const catSet = new Set(profile.cats.map((x) => x.name.toLowerCase()))
    const merchSet = new Set(profile.merchants.map((x) => x.name.toLowerCase()))
    const amountSpike = profile.avg > 0 && Math.abs(simTxItem.amount) > profile.avg * 2
    const oddCat = !catSet.has(simTxItem.category.toLowerCase())
    const oddMerch = !merchSet.has(simTxItem.merchant.toLowerCase())

    if (!amountSpike && !oddCat && !oddMerch && !simTxItem.suspicious) return ''

    return `Deviation detected: the latest simulated fraud transaction does not match this user's normal behavior profile.`
  }, [profile, simTxItem])

  const risk = useMemo(() => getRisk(riskScore), [riskScore])
  const ai = useMemo(() => getAiText(susp), [susp])
  const aiBullets = useMemo(() => getAiBullets(selTx), [selTx])

  const filteredTx = useMemo(() => {
    if (flt === 'suspicious') {
      return tx.filter((t) => t.suspicious && t.fraudState !== 'frozen' && t.fraudState !== 'clear')
    }

    if (flt === 'frozen') {
      return tx.filter((t) => t.fraudState === 'frozen')
    }

    return tx
  }, [flt, tx])

  const pushAl = (tone, txt) => {
    setAl({ id: Date.now(), tone, txt })
  }

  const onSimFraud = () => {
    let nextId = null

    setTx((s) => {
      const n = flagTx(
        {
          id: mkId(),
          date: mkDate(),
          type: 'regular',
          ...simTx
        },
        s
      )
      nextId = n.id
      return [n, ...s]
    })

    if (nextId) setLastSimId(nextId)

    setAlertsToday((v) => v + 1)
    setRiskTrend((s) => {
      const last = s[s.length - 1] || 0
      const next = getNextRiskPoint(last)
      return [...s.slice(-11), next]
    })

    pushAl('danger', 'Fraud simulation added: suspicious transaction inserted')
  }

  const onFraudAction = (id, act) => {
    setTx((s) => s.map((t) => {
      if (t.id !== id) return t

      if (act === 'freeze') {
        return {
          ...t,
          suspicious: true,
          fraudState: 'frozen'
        }
      }

      if (act === 'review') {
        return {
          ...t,
          suspicious: true,
          fraudState: 'review'
        }
      }

      return {
        ...t,
        suspicious: false,
        flags: [],
        fraudState: 'clear'
      }
    }))

    if (act === 'approve' && selTx?.id === id) {
      setSelTx(null)
    }

    if (act === 'approve' && lastSimId === id) {
      setLastSimId(null)
    }

    if (act === 'freeze') {
      pushAl('warn', 'Security Action: Transaction Frozen')
      return
    }

    if (act === 'review') {
      pushAl('warn', 'Security Action: Transaction moved to review')
      return
    }

    pushAl('danger', 'Security Action: Transaction approved and restored')
  }

  const onInspect = (t) => {
    if (!isSuspTx(t)) return
    setSelTx(t)
  }

  useEffect(() => {
    if (!al) return undefined

    if (tRef.current) window.clearTimeout(tRef.current)
    tRef.current = window.setTimeout(() => setAl(null), 3200)

    return () => {
      if (tRef.current) window.clearTimeout(tRef.current)
    }
  }, [al])

  useEffect(() => {
    if (!selTx) return

    const cur = tx.find((t) => t.id === selTx.id)
    if (!cur || !isSuspTx(cur)) {
      setSelTx(null)
      return
    }

    if (cur !== selTx) {
      setSelTx(cur)
    }
  }, [selTx, tx])

  useEffect(() => {
    if (!lastSimId) return

    const cur = tx.find((t) => t.id === lastSimId)
    if (!cur || !isSuspTx(cur)) {
      setLastSimId(null)
    }
  }, [lastSimId, tx])

  const alTone = al?.tone === 'danger'
    ? 'border-rose-500/70 bg-rose-500/15 text-rose-100'
    : 'border-amber-400/60 bg-amber-400/15 text-amber-100'

  return (
    <div className="min-h-screen bg-bg text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <motion.header
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel mb-6 flex items-center justify-between gap-4 p-4"
          initial={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">FinGriffin</p>
            <h1 className="mt-1 text-xl font-semibold text-white">Finance Analytics</h1>
            <p className="mt-1 text-xs text-rose-200/90">Fraud Alerts Today: {alertsToday}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-rose-400/40 bg-rose-500/20 px-3 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-300/60 hover:bg-rose-500/30"
              onClick={onSimFraud}
              type="button"
            >
              <ShieldAlert className="h-4 w-4" />
              Simulate Fraud Transaction
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/20 px-3 py-2 text-sm font-medium text-violet-200 transition hover:border-violet-300/50 hover:bg-violet-500/30"
              type="button"
            >
              Insights
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </motion.header>

        <AnimatePresence mode="wait">
          {al && (
            <motion.div
              key={al.id}
              animate={{ opacity: 1, y: 0 }}
              aria-live={al.tone === 'danger' ? 'assertive' : 'polite'}
              className={`mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-2 text-sm font-medium ${alTone}`}
              exit={{ opacity: 0, y: -8 }}
              initial={{ opacity: 0, y: -8 }}
              role={al.tone === 'danger' ? 'alert' : 'status'}
            >
              <span>{al.txt}</span>
              <button
                aria-label="Dismiss security message"
                className="rounded-md border border-white/20 p-1 text-current/90 transition hover:bg-white/10"
                onClick={() => setAl(null)}
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SummaryCards
              ai={ai}
              items={tx}
              profile={profile}
              profileMsg={profileMsg}
              risk={risk}
              riskScore={riskScore}
              riskTrend={riskTrend}
              score={742}
              suspCount={susp.length}
            />
          </div>
          <div>
            <TransactionList
              filter={flt}
              frozenCount={frozenCount}
              items={filteredTx}
              onApprove={(id) => onFraudAction(id, 'approve')}
              onFilter={setFlt}
              onFreeze={(id) => onFraudAction(id, 'freeze')}
              onInspect={onInspect}
              onReview={(id) => onFraudAction(id, 'review')}
              suspCount={susp.length}
              totalCount={tx.length}
            />
          </div>
        </main>
      </div>

      <AnimatePresence>
        {selTx && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setSelTx(null)}
          >
            <motion.section
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="glass-panel w-full max-w-md border-violet-400/40 p-4"
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="AI explanation for suspicious transaction"
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-violet-300">AI Explanation</p>
                  <h3 className="mt-1 text-sm font-semibold text-zinc-100">Why this transaction was flagged</h3>
                  <p className="mt-1 text-xs text-zinc-400">{selTx.merchant} • {selTx.category}</p>
                </div>
                <button
                  aria-label="Close AI explanation"
                  className="rounded-md border border-white/20 p-1 text-zinc-300 transition hover:bg-white/10"
                  onClick={() => setSelTx(null)}
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <ul className="space-y-2 text-sm text-zinc-200">
                {aiBullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-300" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
