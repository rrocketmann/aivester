const POLICY_TEMPLATES = [
  {
    name: 'Momentum Scanner',
    description: 'Buy on uptrends, sell on downtrends',
    code: `UP_THRESHOLD = 2
DOWN_THRESHOLD = -2
VOLUME_MULT = 1.5
UP_SCORE = 1
DOWN_SCORE = 1

def evaluate(stock, news):
    signals = []
    score = 0

    if stock.change_pct > UP_THRESHOLD:
        signals.append("STRONG_UPTREND")
        score += UP_SCORE
    elif stock.change_pct > 0:
        signals.append("UPTREND")
        score += UP_SCORE * 0.5
    elif stock.change_pct < DOWN_THRESHOLD:
        signals.append("STRONG_DOWNTREND")
        score -= DOWN_SCORE
    elif stock.change_pct < 0:
        signals.append("DOWNTREND")
        score -= DOWN_SCORE * 0.5

    if hasattr(stock, 'avg_volume') and stock.avg_volume and stock.volume > stock.avg_volume * VOLUME_MULT:
        signals.append("VOLUME_SPIKE")
        score += UP_SCORE if stock.change_pct > 0 else -DOWN_SCORE

    positive_words = ["beat", "surge", "growth", "record", "upgrade"]
    negative_words = ["miss", "drop", "decline", "cut", "downgrade"]

    for article in news:
        lower = article.title.lower()
        for w in positive_words:
            if w in lower:
                signals.append("POSITIVE_NEWS")
                score += UP_SCORE
                break
        for w in negative_words:
            if w in lower:
                signals.append("NEGATIVE_NEWS")
                score -= DOWN_SCORE
                break

    return {"symbol": getattr(stock, 'symbol', '?'), "signals": signals, "score": score}
`,
  },
  {
    name: 'Mean Reversion',
    description: 'Buy oversold, sell overbought based on price deviation',
    code: `OVERSOLD_THRESHOLD = -3
OVERBOUGHT_THRESHOLD = 3
VOLUME_CONFIRM_MULT = 1.5
DIP_BUY_SCORE = 1
SPIKE_SELL_SCORE = 1

def evaluate(stock, news):
    if not hasattr(stock, 'change_pct') or stock.change_pct is None:
        return {"symbol": getattr(stock, 'symbol', '?'), "signals": [], "score": 0}

    signals = []
    score = 0

    if stock.change_pct < -3:
        signals.append("OVERSOLD")
        score += 2
    elif stock.change_pct < -1.5:
        signals.append("DIP")
        score += 1

    if stock.change_pct > 3:
        signals.append("OVERBOUGHT")
        score -= 2
    elif stock.change_pct > 1.5:
        signals.append("SPIKE")
        score -= 1

    if stock.volume and hasattr(stock, 'avg_volume') and stock.avg_volume:
        if stock.volume > stock.avg_volume * 1.5:
            signals.append("HIGH_VOLUME")
            if score > 0:
                score += 1
            elif score < 0:
                score -= 1

    return {
        "symbol": getattr(stock, 'symbol', '?'),
        "signals": signals,
        "score": score,
    }
`,
  },
  {
    name: 'Value Investor',
    description: 'Long-term value play based on fundamentals',
    code: `
def evaluate(stock, news):
    signals = []
    score = 0
    symbol = getattr(stock, 'symbol', '?')

    if stock.change_pct < -2:
        signals.append("DIP_BUY")
        score += 1
    elif stock.change_pct > 3:
        signals.append("OVEREXTENDED")
        score -= 1

    if hasattr(stock, 'volume') and hasattr(stock, 'avg_volume') and stock.avg_volume:
        vol_ratio = stock.volume / stock.avg_volume if stock.avg_volume > 0 else 1
        if vol_ratio > 2:
            signals.append("UNUSUAL_VOLUME")
            score += 1 if stock.change_pct < 0 else -1
        elif vol_ratio < 0.5:
            signals.append("LOW_VOLUME")
            score -= 0.5

    bullish = ["buy", "growth", "record", "beat", "upgrade", "raise"]
    bearish = ["sell", "decline", "miss", "cut", "downgrade", "risk"]

    for article in news:
        lower = article.title.lower()
        for w in bullish:
            if w in lower:
                score += 0.5
                signals.append("BULLISH_NEWS")
                break
        for w in bearish:
            if w in lower:
                score -= 0.5
                signals.append("BEARISH_NEWS")
                break

    return {
        "symbol": symbol,
        "signals": signals,
        "score": round(score, 1),
    }
`,
  },
  {
    name: 'Breakout Detector',
    description: 'Detect breakouts on high volume with confirmation',
    code: `
def evaluate(stock, news):
    signals = []
    score = 0
    symbol = getattr(stock, 'symbol', '?')

    change = stock.change_pct if stock.change_pct else 0

    if change > 2.5:
        signals.append("BREAKOUT_UP")
        score += 2
    elif change > 1:
        signals.append("MOMENTUM_UP")
        score += 1

    if change < -2.5:
        signals.append("BREAKDOWN")
        score -= 2
    elif change < -1:
        signals.append("MOMENTUM_DOWN")
        score -= 1

    if hasattr(stock, 'volume') and hasattr(stock, 'avg_volume') and stock.avg_volume and stock.avg_volume > 0:
        vol_ratio = stock.volume / stock.avg_volume
        if vol_ratio > 2 and abs(change) > 1:
            signals.append("CONFIRMED_BREAKOUT")
            if change > 0:
                score += 1
            else:
                score -= 1

    catalysts = ["fda", "earnings", "acquisition", "merger", "contract", "partnership"]
    for article in news:
        lower = article.title.lower()
        for c in catalysts:
            if c in lower:
                signals.append("CATALYST")
                score += 0.5 if change > 0 else -0.5
                break

    return {
        "symbol": symbol,
        "signals": signals,
        "score": round(score, 1),
    }
`,
  },
]

const STORAGE_KEY = 'aivester_policies'

export function savePolicy(name, code) {
  const policies = loadPolicies()
  policies[name] = { code, savedAt: Date.now() }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(policies))
  } catch {}
}

export function loadPolicies() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function deletePolicy(name) {
  const policies = loadPolicies()
  delete policies[name]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(policies))
  } catch {}
}

export function getShareUrl(code) {
  try {
    const encoded = btoa(encodeURIComponent(code))
    return `${window.location.origin}${window.location.pathname}#code=${encoded}`
  } catch {
    return window.location.href
  }
}

export function loadCodeFromUrl() {
  try {
    const hash = window.location.hash
    if (hash.startsWith('#code=')) {
      const encoded = hash.slice(6)
      return decodeURIComponent(atob(encoded))
    }
  } catch {}
  return null
}

export { POLICY_TEMPLATES }
