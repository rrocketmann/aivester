const POLICY_TEMPLATES = [
  {
    name: 'Momentum Scanner',
    description: 'Buy on uptrends, sell on downtrends',
    code: `# Momentum Scanner
# Buy when momentum is positive, sell when negative

def evaluate(stock, news):
    signals = []

    # Price momentum
    if stock.change_pct > 2:
        signals.append("STRONG_UPTREND")
    elif stock.change_pct > 0:
        signals.append("UPTREND")
    elif stock.change_pct < -2:
        signals.append("STRONG_DOWNTREND")
    else:
        signals.append("DOWNTREND")

    # Volume spike
    if stock.volume > stock.avg_volume * 1.5:
        signals.append("VOLUME_SPIKE")

    # News sentiment
    positive_words = ["beat", "surge", "growth", "record", "upgrade"]
    negative_words = ["miss", "drop", "decline", "cut", "downgrade"]

    for article in news:
        lower = article.title.lower()
        for w in positive_words:
            if w in lower:
                signals.append("POSITIVE_NEWS")
                break
        for w in negative_words:
            if w in lower:
                signals.append("NEGATIVE_NEWS")
                break

    return {
        "symbol": stock.symbol,
        "signals": signals,
        "score": len([s for s in signals
                      if "UP" in s or "POSITIVE" in s])
              - len([s for s in signals
                     if "DOWN" in s or "NEGATIVE" in s])
    }
`,
  },
  {
    name: 'Mean Reversion',
    description: 'Buy oversold, sell overbought based on price deviation',
    code: `# Mean Reversion
# Buy when price drops significantly, sell on recoveries

def evaluate(stock, news):
    # How far from average (approximation using available data)
    if not hasattr(stock, 'change_pct') or stock.change_pct is None:
        return {"symbol": getattr(stock, 'symbol', '?'), "signals": [], "score": 0}

    signals = []
    score = 0

    # Oversold = buying opportunity
    if stock.change_pct < -3:
        signals.append("OVERSOLD")
        score += 2
    elif stock.change_pct < -1.5:
        signals.append("DIP")
        score += 1

    # Overbought = selling opportunity
    if stock.change_pct > 3:
        signals.append("OVERBOUGHT")
        score -= 2
    elif stock.change_pct > 1.5:
        signals.append("SPIKE")
        score -= 1

    # Volume confirms reversal
    if stock.volume and hasattr(stock, 'avg_volume') and stock.avg_volume:
        if stock.volume > stock.avg_volume * 1.5:
            signals.append("HIGH_VOLUME")
            # Amplify the signal
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
    code: `# Value Investor
# Focus on value metrics and longer-term trends

def evaluate(stock, news):
    signals = []
    score = 0
    symbol = getattr(stock, 'symbol', '?')

    # Strong daily moves create opportunities
    if stock.change_pct < -2:
        signals.append("DIP_BUY")
        score += 1
    elif stock.change_pct > 3:
        signals.append("OVEREXTENDED")
        score -= 1

    # Volume analysis
    if hasattr(stock, 'volume') and hasattr(stock, 'avg_volume') and stock.avg_volume:
        vol_ratio = stock.volume / stock.avg_volume if stock.avg_volume > 0 else 1
        if vol_ratio > 2:
            signals.append("UNUSUAL_VOLUME")
            score += 1 if stock.change_pct < 0 else -1
        elif vol_ratio < 0.5:
            signals.append("LOW_VOLUME")
            score -= 0.5

    # News analysis with weighted sentiment
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
    code: `# Breakout Detector
# Enter on confirmed breakouts, exit on weak momentum

def evaluate(stock, news):
    signals = []
    score = 0
    symbol = getattr(stock, 'symbol', '?')

    # Price breakout detection
    change = stock.change_pct if stock.change_pct else 0

    # Strong move up
    if change > 2.5:
        signals.append("BREAKOUT_UP")
        score += 2
    elif change > 1:
        signals.append("MOMENTUM_UP")
        score += 1

    # Strong move down
    if change < -2.5:
        signals.append("BREAKDOWN")
        score -= 2
    elif change < -1:
        signals.append("MOMENTUM_DOWN")
        score -= 1

    # Volume confirmation (breakout needs volume)
    if hasattr(stock, 'volume') and hasattr(stock, 'avg_volume') and stock.avg_volume and stock.avg_volume > 0:
        vol_ratio = stock.volume / stock.avg_volume
        if vol_ratio > 2 and abs(change) > 1:
            signals.append("CONFIRMED_BREAKOUT")
            if change > 0:
                score += 1
            else:
                score -= 1

    # News catalyst
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