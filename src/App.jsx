import { AnimatePresence, motion } from 'framer-motion'
import { Activity, BrainCircuit, FileText, ShieldAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import RiskReportModal from './components/RiskReportModal'
import SummaryCards from './components/SummaryCards'
import TransactionList from './components/TransactionList'
import { transactions } from './data/transactions'

const simTx = {
  merchant: 'Unknown Merchant',
  amount: -2800,
  category: 'Crypto Transfer',
  country: 'Singapore'
}

const mkDate = () => new Date().toISOString().slice(0, 10)
const mkId = () => `t${Date.now()}`
const clamp = (v, min, max) => Math.min(Math.max(v, min), max)
const dayMs = 24 * 60 * 60 * 1000
const ANALYZE_MS = 1000

const amountFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
})

const regionMap = {
  'United States': 'North America',
  Canada: 'North America',
  Mexico: 'North America',
  'United Kingdom': 'Europe',
  Germany: 'Europe',
  France: 'Europe',
  Romania: 'Europe',
  Singapore: 'Asia',
  Japan: 'Asia',
  Australia: 'Oceania',
  Brazil: 'South America'
}

function getRegion(country) {
  if (!country) return 'Unknown'
  return regionMap[country] || 'Other'
}

function getTopRegion(mapObj) {
  const rows = Object.entries(mapObj)
  if (!rows.length) return null
  return rows.sort((a, b) => b[1] - a[1])[0][0]
}

function isLocAnomaly(t, base) {
  if (!t || !base.typicalRegion || t.amount >= 0) return false
  return getRegion(t.country) !== base.typicalRegion
}

function getHistBaseRegion(hist) {
  const clearOut = hist.filter((x) => x.amount < 0 && x.type !== 'fraud' && x.fraudState !== 'frozen' && x.fraudState !== 'review')

  const reg = clearOut.reduce((acc, t) => {
    const k = getRegion(t.country)
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

  return getTopRegion(reg)
}

function flagTx(t, hist) {
  const rs = []
  const a = Math.abs(t.amount)

  if (a > 1000) rs.push('Amount exceeds $1,000 threshold')

  const mSet = new Set(hist.map((x) => x.merchant.toLowerCase()))
  const m = t.merchant.toLowerCase()
  if (m.includes('unknown') || !mSet.has(m)) rs.push('Merchant is unknown in account history')

  const cSet = new Set(hist.filter((x) => x.amount < 0).map((x) => x.category.toLowerCase()))
  if (t.amount < 0 && !cSet.has(t.category.toLowerCase())) rs.push('Category is unusual for prior spending pattern')

  const typicalRegion = getHistBaseRegion(hist)
  if (t.amount < 0 && typicalRegion && getRegion(t.country) !== typicalRegion) {
    rs.push('Location anomaly compared to typical account region')
  }

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

function isSuspTx(t) {
  return t.suspicious || t.fraudState === 'review' || t.fraudState === 'frozen'
}

function getAiBullets(t, base) {
  if (!t) return []

  if (!isSuspTx(t)) {
    return [
      'No active anomaly workflow on this transaction.',
      'Behavior aligns with baseline patterns for merchant, category, amount, and location.'
    ]
  }

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

  if (isLocAnomaly(t, base)) {
    out.push(`Location anomaly detected: ${t.country} is outside the typical ${base.typicalRegion} spending region.`)
  }

  if (!out.length && t.flags?.length) {
    t.flags.forEach((x) => out.push(x))
  }

  if (!out.length) {
    out.push('Pattern deviates from baseline profile and requires additional review.')
  }

  return out
}

function toDayTs(d) {
  return new Date(`${d}T00:00:00`).getTime()
}

function toTxTs(t) {
  if (!t) return 0
  if (Number.isFinite(t.stateTs)) return t.stateTs
  const dayTs = toDayTs(t.date)
  return Number.isFinite(dayTs) ? dayTs : 0
}

function getConfidenceLevel(factorCount) {
  if (factorCount >= 4) return 'High'
  if (factorCount >= 2) return 'Medium'
  return 'Low'
}

function isRapidSpend(t, list, avg) {
  if (!t || t.amount >= 0) return false

  const ts = toDayTs(t.date)
  if (Number.isNaN(ts)) return false

  const near = list.filter((x) => {
    if (x.id === t.id || x.amount >= 0) return false
    const d = toDayTs(x.date)
    return !Number.isNaN(d) && Math.abs(d - ts) <= dayMs
  })

  const cnt = near.length + 1
  const sum = near.reduce((acc, x) => acc + Math.abs(x.amount), 0) + Math.abs(t.amount)
  const base = Math.max(avg, 1)

  return cnt >= 3 || sum >= base * 3
}

function getRiskExplainRows(t, list, base) {
  if (!t || !isSuspTx(t)) return []

  const out = []
  const amt = Math.abs(t.amount)
  const avg = base.avg

  if ((avg > 0 && amt > avg * 1.75) || (avg === 0 && amt > 1000)) {
    out.push({
      id: 'amount',
      label: 'Amount exceeds baseline',
      detail: `Transaction amount ${amt.toLocaleString('en-US')} is materially above the baseline average of ${Math.max(avg, 0).toLocaleString('en-US')}.`
    })
  }

  if (!base.mSet.has(t.merchant.toLowerCase())) {
    out.push({
      id: 'merchant',
      label: 'New merchant',
      detail: 'Merchant has not appeared in regular account history.'
    })
  }

  if (t.amount < 0 && !base.cSet.has(t.category.toLowerCase())) {
    out.push({
      id: 'category',
      label: 'Unusual category',
      detail: 'Spending category differs from typical historical behavior.'
    })
  }

  if (isLocAnomaly(t, base)) {
    out.push({
      id: 'location',
      label: 'Location anomaly',
      detail: `Transaction country ${t.country} maps to ${getRegion(t.country)}, outside the typical ${base.typicalRegion} region.`
    })
  }

  if (isRapidSpend(t, list, avg)) {
    out.push({
      id: 'velocity',
      label: 'Rapid spending',
      detail: 'A high volume or spend total occurred in a short 24-hour window.'
    })
  }

  if (!out.length) {
    out.push({
      id: 'fallback',
      label: 'Manual review suggested',
      detail: 'The transaction remains in a risk workflow state and should be reviewed.'
    })
  }

  return out
}

function topRows(mapObj, limit = 3) {
  return Object.entries(mapObj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}

function getFraudTxScore(t, base) {
  const amt = Math.abs(t.amount)
  const avg = base.avg

  const dev = avg > 0 ? Math.max(amt - avg, 0) / avg : amt / 500
  const amtPts = clamp(Math.round(dev * 45), 0, 45)

  const m = t.merchant.toLowerCase()
  const c = t.category.toLowerCase()
  const newMerchPts = base.mSet.has(m) ? 0 : 30
  const oddCatPts = base.cSet.has(c) ? 0 : 25
  const locPts = isLocAnomaly(t, base) ? 20 : 0

  return clamp(amtPts + newMerchPts + oddCatPts + locPts, 0, 100)
}

function getStateWeight(state) {
  if (state === 'frozen') return 1.25
  if (state === 'review') return 1.12
  if (state === 'suspicious') return 1.05
  return 1
}

function getRiskSnapshot(list, base) {
  const active = list.filter((t) => t.fraudState !== 'clear')
  if (!active.length) return 0

  const vals = active.map((t) => {
    const baseScore = getFraudTxScore(t, base)
    const weighted = Math.round(baseScore * getStateWeight(t.fraudState))
    return clamp(weighted, 0, 100)
  })

  const maxV = Math.max(...vals, 0)
  const avgV = Math.round(vals.reduce((acc, v) => acc + v, 0) / vals.length)
  return clamp(Math.round(maxV * 0.62 + avgV * 0.38), 0, 100)
}

function buildRiskTrend(list, base, size = 8) {
  const rows = [...list].sort((a, b) => toDayTs(a.date) - toDayTs(b.date))
  if (!rows.length) return Array.from({ length: size }, () => 0)

  const out = []
  const hist = []

  rows.forEach((t) => {
    hist.push(t)
    out.push(getRiskSnapshot(hist, base))
  })

  const tail = out.slice(-size)
  while (tail.length < size) {
    tail.unshift(tail[0] || 0)
  }

  return tail
}

function getSeverity(type, amount, state) {
  let sev = 'Low'

  if (type === 'amount') {
    sev = amount >= 2200 ? 'High' : 'Medium'
  }

  if (type === 'merchant' || type === 'location' || type === 'workflow') {
    sev = 'Medium'
  }

  if (state === 'review' && sev === 'Low') {
    sev = 'Medium'
  }

  if (state === 'frozen') {
    sev = 'High'
  }

  return sev
}

function getAlertTs(d, step) {
  const hour = String((8 + step * 3) % 24).padStart(2, '0')
  return new Date(`${d}T${hour}:00:00`).getTime()
}

function buildFraudAlerts(list, base) {
  const out = []

  list.forEach((t) => {
    if (!isSuspTx(t)) return

    const amount = Math.abs(t.amount)
    const avg = base.avg
    const d = t.stateDay || t.date
    const m = t.merchant.toLowerCase()
    const c = t.category.toLowerCase()

    const amtAnomaly = (avg > 0 && amount > avg * 1.75) || (avg === 0 && amount > 1000)
    const newMerchant = !base.mSet.has(m)
    const catMismatch = t.amount < 0 && !base.cSet.has(c)
    const locAnomaly = isLocAnomaly(t, base)

    let step = 0
    const baseTs = Number.isFinite(t.stateTs) ? t.stateTs : getAlertTs(d, 0)

    if (amtAnomaly) {
      const sev = getSeverity('amount', amount, t.fraudState)
      out.push({
        id: `${t.id}-amount`,
        txId: t.id,
        ts: baseTs + step * 60_000,
        day: d,
        sev,
        reason: 'Amount anomaly',
        text: `Amount ${amount.toLocaleString('en-US')} is above expected baseline.`
      })
      step += 1
    }

    if (newMerchant) {
      const sev = getSeverity('merchant', amount, t.fraudState)
      out.push({
        id: `${t.id}-merchant`,
        txId: t.id,
        ts: baseTs + step * 60_000,
        day: d,
        sev,
        reason: 'New merchant',
        text: `${t.merchant} does not match known merchant history.`
      })
      step += 1
    }

    if (catMismatch) {
      const sev = getSeverity('category', amount, t.fraudState)
      out.push({
        id: `${t.id}-category`,
        txId: t.id,
        ts: baseTs + step * 60_000,
        day: d,
        sev,
        reason: 'Category mismatch',
        text: `${t.category} is unusual for established spending behavior.`
      })
      step += 1
    }

    if (locAnomaly) {
      const sev = getSeverity('location', amount, t.fraudState)
      out.push({
        id: `${t.id}-location`,
        txId: t.id,
        ts: baseTs + step * 60_000,
        day: d,
        sev,
        reason: 'Location anomaly',
        text: `${t.country} falls outside the typical ${base.typicalRegion} region.`
      })
      step += 1
    }

    if (step === 0) {
      const sev = getSeverity('workflow', amount, t.fraudState)
      const reason = t.fraudState === 'frozen' ? 'Transaction frozen' : t.fraudState === 'review' ? 'Manual review started' : 'Suspicious workflow active'
      const text = t.fraudState === 'frozen'
        ? 'Transaction has been frozen pending anti-fraud verification.'
        : t.fraudState === 'review'
          ? 'Transaction has been moved to review for additional checks.'
          : 'Transaction remains suspicious and is tracked in the fraud workflow.'

      out.push({
        id: `${t.id}-workflow`,
        txId: t.id,
        ts: baseTs,
        day: d,
        sev,
        reason,
        text
      })
    }
  })

  return out.sort((a, b) => b.ts - a.ts)
}

function buildBaseProfile(list) {
  const baseTx = list.filter((t) => t.amount < 0 && t.fraudState === 'clear' && t.type !== 'fraud')
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

  const regCount = baseTx.reduce((acc, t) => {
    const k = getRegion(t.country)
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

  const typicalRegion = getTopRegion(regCount)

  return {
    avg,
    sampleSize: count,
    catMap,
    merchMap,
    regCount,
    typicalRegion,
    cSet: new Set(Object.keys(catMap).map((k) => k.toLowerCase())),
    mSet: new Set(Object.keys(merchMap).map((k) => k.toLowerCase()))
  }
}

function mkRiskPoint(score, ts = Date.now()) {
  return {
    id: `r${ts}-${Math.floor(Math.random() * 10_000)}`,
    ts,
    score: clamp(Math.round(score), 0, 100)
  }
}

function getLastTs(list) {
  if (!list.length) return Date.now()
  return list.reduce((maxTs, t) => Math.max(maxTs, toTxTs(t)), 0) || Date.now()
}

function getDrawerAction(t, list, base) {
  if (!t) return null

  const score = getFraudTxScore(t, base)
  const amt = Math.abs(t.amount)
  const amountSpike = (base.avg > 0 && amt > base.avg * 1.75) || (base.avg === 0 && amt > 1000)
  const locRisk = isLocAnomaly(t, base)
  const velRisk = isRapidSpend(t, list, base.avg)

  if (t.fraudState === 'frozen') {
    return {
      tone: 'high',
      title: 'Keep transaction frozen',
      text: 'Freeze state is already active. Maintain hold and complete identity/payment confirmation before release.'
    }
  }

  if (t.fraudState === 'review') {
    return {
      tone: 'medium',
      title: 'Continue manual review',
      text: 'Review workflow is active. Validate merchant legitimacy and confirm user intent before approving.'
    }
  }

  if (t.fraudState === 'suspicious' || score >= 71 || (amountSpike && locRisk)) {
    return {
      tone: 'high',
      title: 'Escalate to freeze',
      text: 'Signals indicate elevated fraud risk. Freeze this transaction and require additional verification.'
    }
  }

  if (score >= 40 || amountSpike || velRisk || t.flags?.length) {
    return {
      tone: 'medium',
      title: 'Move to review',
      text: 'Moderate anomaly evidence detected. Route to review queue for analyst validation.'
    }
  }

  return {
    tone: 'low',
    title: 'Approve and monitor',
    text: 'No material anomaly indicators remain. Keep approved with routine monitoring.'
  }
}

function getActionTone(tone) {
  if (tone === 'high') return 'border-rose-400/55 bg-rose-500/15 text-rose-100'
  if (tone === 'medium') return 'border-amber-400/55 bg-amber-500/15 text-amber-100'
  return 'border-emerald-400/55 bg-emerald-500/15 text-emerald-100'
}

const seedTx = hydrateTx(transactions)
const seedBase = buildBaseProfile(seedTx)
const seedRisk = getRiskSnapshot(seedTx, seedBase)
const seedRiskTl = [mkRiskPoint(seedRisk, getLastTs(seedTx))]

function App() {
  const [tx, setTx] = useState(() => seedTx)
  const [riskTl, setRiskTl] = useState(() => seedRiskTl)
  const [al, setAl] = useState(null)
  const [flt, setFlt] = useState('all')
  const [selTx, setSelTx] = useState(null)
  const [lastSimId, setLastSimId] = useState(null)
  const [anlz, setAnlz] = useState(null)
  const [showRiskReport, setShowRiskReport] = useState(false)
  const tRef = useRef(null)
  const simRef = useRef(null)

  const todayKey = useMemo(() => mkDate(), [])

  const susp = useMemo(
    () => tx.filter((t) => isSuspTx(t)),
    [tx]
  )
  const suspCount = useMemo(
    () => tx.filter((t) => t.fraudState === 'suspicious' || t.fraudState === 'review').length,
    [tx]
  )
  const frozenCount = useMemo(
    () => tx.filter((t) => t.fraudState === 'frozen').length,
    [tx]
  )
  const approvedCount = useMemo(
    () => tx.filter((t) => t.fraudState === 'clear').length,
    [tx]
  )

  const headerAlertsTodayCount = useMemo(
    () => tx.filter((t) => t.fraudState !== 'clear' && t.stateDay === todayKey).length,
    [tx, todayKey]
  )

  const baseProfile = useMemo(() => buildBaseProfile(tx), [tx])

  const profile = useMemo(() => {
    return {
      avg: baseProfile.avg,
      sampleSize: baseProfile.sampleSize,
      cats: topRows(baseProfile.catMap),
      merchants: topRows(baseProfile.merchMap),
      regions: topRows(baseProfile.regCount, 1),
      typicalRegion: baseProfile.typicalRegion
    }
  }, [baseProfile])

  const riskTrend = useMemo(() => buildRiskTrend(tx, baseProfile), [baseProfile, tx])
  const riskScore = riskTrend[riskTrend.length - 1] || 0

  const fraudScore = useMemo(() => {
    const active = tx.filter((t) => t.fraudState !== 'clear')
    if (!active.length) return 0

    const vals = active.map((t) => {
      const baseScore = getFraudTxScore(t, baseProfile)
      const weighted = Math.round(baseScore * getStateWeight(t.fraudState))
      return clamp(weighted, 0, 100)
    })

    const maxV = Math.max(...vals, 0)
    const avgV = Math.round(vals.reduce((acc, v) => acc + v, 0) / vals.length)

    return clamp(Math.round(maxV * 0.65 + avgV * 0.35), 0, 100)
  }, [baseProfile, tx])

  const ledgerBalance = useMemo(
    () => tx.reduce((acc, t) => acc + t.amount, 0),
    [tx]
  )

  const holdAmount = useMemo(
    () => tx.reduce((acc, t) => {
      if (t.amount < 0 && (t.fraudState === 'review' || t.fraudState === 'frozen')) {
        return acc + Math.abs(t.amount)
      }
      return acc
    }, 0),
    [tx]
  )

  const availBalance = useMemo(
    () => ledgerBalance + holdAmount,
    [holdAmount, ledgerBalance]
  )

  const fraudAlerts = useMemo(() => buildFraudAlerts(tx, baseProfile), [baseProfile, tx])

  const alertsTodayCount = useMemo(
    () => fraudAlerts.filter((a) => a.day === todayKey).length,
    [fraudAlerts, todayKey]
  )

  const alertsRows = useMemo(() => {
    const todayRows = fraudAlerts.filter((a) => a.day === todayKey)
    return (todayRows.length ? todayRows : fraudAlerts).slice(0, 8)
  }, [fraudAlerts, todayKey])

  const alertsFallback = useMemo(
    () => alertsRows.length > 0 && alertsRows[0].day !== todayKey,
    [alertsRows, todayKey]
  )

  const simTxItem = useMemo(
    () => (lastSimId ? tx.find((t) => t.id === lastSimId) || null : null),
    [lastSimId, tx]
  )

  const profileMsg = useMemo(() => {
    if (!simTxItem || !isSuspTx(simTxItem)) return ''

    const amountSpike = profile.avg > 0 && Math.abs(simTxItem.amount) > profile.avg * 2
    const oddCat = !baseProfile.cSet.has(simTxItem.category.toLowerCase())
    const oddMerch = !baseProfile.mSet.has(simTxItem.merchant.toLowerCase())
    const oddLoc = isLocAnomaly(simTxItem, baseProfile)

    if (!amountSpike && !oddCat && !oddMerch && !oddLoc && !simTxItem.suspicious) return ''

    return `Deviation detected: the latest simulated fraud transaction does not match this user's normal behavior profile.`
  }, [baseProfile, profile.avg, simTxItem])

  const latestSuspTx = useMemo(() => {
    if (!susp.length) return null

    return susp.reduce((latest, row) => {
      if (!latest) return row
      return toTxTs(row) > toTxTs(latest) ? row : latest
    }, null)
  }, [susp])

  const aiConfidence = useMemo(() => {
    if (!latestSuspTx) {
      return { level: 'Low', factors: 0 }
    }

    const factors = getRiskExplainRows(latestSuspTx, tx, baseProfile)
      .filter((r) => r.id !== 'fallback')
      .length

    return {
      level: getConfidenceLevel(factors),
      factors
    }
  }, [baseProfile, latestSuspTx, tx])

  const risk = useMemo(() => getRisk(riskScore), [riskScore])
  const ai = useMemo(() => getAiText(susp), [susp])
  const aiBullets = useMemo(() => getAiBullets(selTx, baseProfile), [baseProfile, selTx])
  const riskExplain = useMemo(() => getRiskExplainRows(selTx, tx, baseProfile), [baseProfile, selTx, tx])

  const selRiskScore = useMemo(
    () => (selTx ? getFraudTxScore(selTx, baseProfile) : 0),
    [baseProfile, selTx]
  )
  const selRiskZone = useMemo(() => getRisk(selRiskScore), [selRiskScore])
  const drawerAction = useMemo(
    () => getDrawerAction(selTx, tx, baseProfile),
    [baseProfile, selTx, tx]
  )

  const unusualMerchants = useMemo(() => {
    const map = tx.reduce((acc, t) => {
      if (!isSuspTx(t)) return acc
      const key = t.merchant.toLowerCase()
      if (baseProfile.mSet.has(key)) return acc
      acc[t.merchant] = (acc[t.merchant] || 0) + 1
      return acc
    }, {})

    return topRows(map, 5)
  }, [baseProfile, tx])

  const recActions = useMemo(() => {
    const out = []
    const trendNow = riskTrend[riskTrend.length - 1] || 0
    const trendPrev = riskTrend[Math.max(riskTrend.length - 2, 0)] || 0
    const trendUp = trendNow > trendPrev

    if (fraudScore >= 71) {
      out.push({
        id: 'freeze-risky',
        priority: 'high',
        title: 'Escalate high-risk workflow',
        text: 'Freeze the highest-risk suspicious transactions and require explicit analyst approval before release.'
      })
    }

    if (suspCount > 0) {
      out.push({
        id: 'review-open',
        priority: 'medium',
        title: 'Review suspicious transactions',
        text: `There are ${suspCount} suspicious/review transactions; prioritize manual checks for high-amount or first-seen merchant events.`
      })
    }

    if (unusualMerchants.length > 0) {
      out.push({
        id: 'merchant-watch',
        priority: 'medium',
        title: 'Expand merchant watchlist checks',
        text: 'Unusual merchants are active in the workflow; apply stronger verification for repeated unknown merchant patterns.'
      })
    }

    if (trendUp) {
      out.push({
        id: 'trend-up',
        priority: 'high',
        title: 'Investigate rising risk trend',
        text: 'Risk trend has increased in the latest interval; investigate recent alerts for velocity, location, and category mismatches.'
      })
    }

    if (frozenCount > 0) {
      out.push({
        id: 'frozen-followup',
        priority: 'low',
        title: 'Resolve frozen queue',
        text: `There are ${frozenCount} frozen transactions; complete verification to reduce held funds and false-positive impact.`
      })
    }

    if (!out.length) {
      out.push({
        id: 'stable-monitor',
        priority: 'low',
        title: 'Maintain continuous monitoring',
        text: 'Current risk posture is stable. Continue routine monitoring and anomaly scoring checks.'
      })
    }

    return out.slice(0, 4)
  }, [fraudScore, frozenCount, riskTrend, suspCount, unusualMerchants.length])

  const filteredTx = useMemo(() => {
    if (flt === 'suspicious') {
      return tx.filter((t) => t.fraudState === 'suspicious' || t.fraudState === 'review')
    }

    if (flt === 'frozen') {
      return tx.filter((t) => t.fraudState === 'frozen')
    }

    if (flt === 'approved') {
      return tx.filter((t) => t.fraudState === 'clear')
    }

    return tx
  }, [flt, tx])

  const geoTx = useMemo(
    () => filteredTx.map((t) => ({ ...t, locationAnomaly: isLocAnomaly(t, baseProfile) })),
    [baseProfile, filteredTx]
  )

  const pushAl = (tone, txt) => {
    setAl({ id: Date.now(), tone, txt })
  }

  const onSimFraud = () => {
    if (anlz) return

    const pending = {
      id: `a${Date.now()}`,
      date: mkDate(),
      ...simTx
    }

    setAnlz(pending)
    pushAl('warn', 'AI analyzing transaction signal...')

    if (simRef.current) {
      window.clearTimeout(simRef.current)
    }

    simRef.current = window.setTimeout(() => {
      const nowDay = mkDate()
      const nowTs = Date.now()
      let nextId = null

      setTx((s) => {
        const raw = {
          id: mkId(),
          date: nowDay,
          type: 'regular',
          ...simTx
        }

        const flagged = flagTx(raw, s)
        const n = flagged.suspicious
          ? { ...flagged, stateDay: nowDay, stateTs: nowTs }
          : flagged

        const nextTx = [n, ...s]
        const nextBase = buildBaseProfile(nextTx)
        const nextRisk = getRiskSnapshot(nextTx, nextBase)

        setRiskTl((prev) => [...prev, mkRiskPoint(nextRisk, nowTs)].slice(-24))

        nextId = n.id
        return nextTx
      })

      if (nextId) setLastSimId(nextId)
      setAnlz(null)
      pushAl('danger', 'Fraud simulation added: suspicious transaction inserted')
      simRef.current = null
    }, ANALYZE_MS)
  }

  const onFraudAction = (id, act) => {
    const actionDay = mkDate()
    const actionTs = Date.now()

    setTx((s) => s.map((t) => {
      if (t.id !== id) return t

      if (act === 'freeze') {
        return {
          ...t,
          suspicious: true,
          fraudState: 'frozen',
          stateDay: actionDay,
          stateTs: actionTs
        }
      }

      if (act === 'review') {
        return {
          ...t,
          suspicious: true,
          fraudState: 'review',
          stateDay: actionDay,
          stateTs: actionTs
        }
      }

      return {
        ...t,
        suspicious: false,
        fraudState: 'clear',
        stateDay: null,
        stateTs: null
      }
    }))

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
    setSelTx(t)
  }

  useEffect(() => {
    return () => {
      if (simRef.current) window.clearTimeout(simRef.current)
    }
  }, [])

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
    if (!cur) {
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
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-violet-400/35 bg-violet-500/12 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/90">Fraud Alerts Today</p>
              <p className="mt-1 text-sm font-semibold text-violet-100">{headerAlertsTodayCount}</p>
            </div>
            <div className="rounded-xl border border-emerald-400/45 bg-emerald-500/15 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300/70" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
                </span>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">AI Monitoring Active</p>
              </div>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-100/95">
                <Activity className="h-3.5 w-3.5" />
                Fraud Detection Engine Running
              </p>
            </div>
            <button
              className={[
                'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
                anlz
                  ? 'cursor-not-allowed border-violet-400/45 bg-violet-500/15 text-violet-200/85'
                  : 'border-rose-400/40 bg-rose-500/20 text-rose-100 hover:border-rose-300/60 hover:bg-rose-500/30'
              ].join(' ')}
              disabled={Boolean(anlz)}
              onClick={onSimFraud}
              type="button"
            >
              <ShieldAlert className="h-4 w-4" />
              {anlz ? 'AI Analyzing...' : 'Simulate Fraud Transaction'}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/20 px-3 py-2 text-sm font-medium text-violet-200 transition hover:border-violet-300/50 hover:bg-violet-500/30"
              onClick={() => setShowRiskReport(true)}
              type="button"
            >
              Generate Risk Report
              <FileText className="h-4 w-4" />
            </button>
          </div>
        </motion.header>

        <AnimatePresence>
          {anlz && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              aria-live="polite"
              className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-violet-400/35 bg-violet-500/12 px-4 py-2 text-sm text-violet-100"
              exit={{ opacity: 0, y: -6 }}
              initial={{ opacity: 0, y: -6 }}
              role="status"
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-300/70" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-300" />
                </span>
                <BrainCircuit className="h-4 w-4 animate-pulse text-violet-200" />
                <span className="font-medium">AI analyzing transaction...</span>
              </div>
              <span className="text-xs text-violet-200/80">Applying baseline checks (~1s)</span>
            </motion.div>
          )}
        </AnimatePresence>

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
              aiConfidence={aiConfidence}
              alertsFallback={alertsFallback}
              balance={availBalance}
              fraudAlerts={alertsRows}
              fraudScore={fraudScore}
              holdAmount={holdAmount}
              items={tx}
              profile={profile}
              profileMsg={profileMsg}
              risk={risk}
              riskExplain={riskExplain}
              riskScore={riskScore}
              riskTimeline={riskTl}
              riskTrend={riskTrend}
              selTx={selTx}
              suspCount={susp.length}
            />
          </div>
          <div>
            <TransactionList
              analyzingTx={anlz}
              approvedCount={approvedCount}
              filter={flt}
              frozenCount={frozenCount}
              items={geoTx}
              onApprove={(id) => onFraudAction(id, 'approve')}
              onFilter={setFlt}
              onFreeze={(id) => onFraudAction(id, 'freeze')}
              onInspect={onInspect}
              onReview={(id) => onFraudAction(id, 'review')}
              suspCount={suspCount}
              totalCount={tx.length}
              typicalRegion={baseProfile.typicalRegion}
            />
          </div>
        </main>
      </div>

      <AnimatePresence>
        {selTx && (
          <>
            <motion.button
              animate={{ opacity: 1 }}
              aria-label="Close transaction details"
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              onClick={() => setSelTx(null)}
              type="button"
            />

            <motion.aside
              animate={{ x: 0, opacity: 1 }}
              aria-label="Transaction details drawer"
              aria-modal="true"
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-violet-400/35 bg-[#09090b]/95 p-4 shadow-2xl backdrop-blur-xl"
              exit={{ x: '100%', opacity: 0.95 }}
              initial={{ x: '100%', opacity: 0.95 }}
              role="dialog"
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="flex h-full flex-col">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-violet-300">Transaction Details</p>
                    <h3 className="mt-1 text-base font-semibold text-zinc-100">{selTx.merchant}</h3>
                    <p className="mt-1 text-xs text-zinc-400">{selTx.date}</p>
                  </div>
                  <button
                    aria-label="Close transaction details"
                    className="rounded-md border border-white/20 p-1 text-zinc-300 transition hover:bg-white/10"
                    onClick={() => setSelTx(null)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 overflow-y-auto pr-1">
                  <section className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Amount</p>
                    <p className={`mt-1 text-xl font-semibold ${selTx.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {amountFmt.format(selTx.amount)}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                        <p className="text-zinc-500">Category</p>
                        <p className="mt-1 font-medium text-zinc-200">{selTx.category}</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                        <p className="text-zinc-500">Location</p>
                        <p className="mt-1 font-medium text-zinc-200">{selTx.country || 'Unknown'}</p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-wide text-violet-300">AI Risk Explanation</p>
                      <span className={[
                        'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        selRiskZone === 'High'
                          ? 'border-rose-400/60 text-rose-200'
                          : selRiskZone === 'Medium'
                            ? 'border-amber-400/60 text-amber-200'
                            : 'border-emerald-400/60 text-emerald-200'
                      ].join(' ')}>
                        {selRiskZone} • {selRiskScore}
                      </span>
                    </div>

                    <ul className="mt-2 space-y-1.5 text-xs text-zinc-200">
                      {aiBullets.map((b) => (
                        <li key={b} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-300" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>

                    {riskExplain.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {riskExplain.map((r) => (
                          <div key={r.id} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-200">{r.label}</p>
                            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{r.detail}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {drawerAction && (
                    <section className={`rounded-xl border p-3 ${getActionTone(drawerAction.tone)}`}>
                      <p className="text-[11px] uppercase tracking-wide">Recommended Action</p>
                      <p className="mt-1 text-sm font-semibold">{drawerAction.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-current/90">{drawerAction.text}</p>
                    </section>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <RiskReportModal
        fraudScore={fraudScore}
        onClose={() => setShowRiskReport(false)}
        open={showRiskReport}
        recActions={recActions}
        riskTrend={riskTrend}
        suspiciousCount={suspCount + frozenCount}
        unusualMerchants={unusualMerchants}
      />
    </div>
  )
}

export default App
