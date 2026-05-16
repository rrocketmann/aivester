let pyodideInstance = null
let loadingPromise = null

export async function loadPyodideEngine() {
  if (pyodideInstance) return pyodideInstance
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js'
    script.async = true
    document.head.appendChild(script)

    await new Promise((resolve, reject) => {
      script.onload = resolve
      script.onerror = reject
    })

    pyodideInstance = await window.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/',
    })
    return pyodideInstance
  })()

  return loadingPromise
}

function pyToJs(obj) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(pyToJs)
  if (obj.toJs) {
    try { return pyToJs(obj.toJs({ create_pyproxies: false })) } catch { /* fallthrough */ }
  }
  const result = {}
  for (const key of Object.keys(obj)) {
    result[key] = pyToJs(obj[key])
  }
  return result
}

export async function runPythonPolicy(code, stockData, newsData, chartData) {
  const pyodide = await loadPyodideEngine()

  const wrapperCode = `
import json

class Stock:
    def __init__(self, data):
        for key, value in data.items():
            setattr(self, key, value)

class NewsArticle:
    def __init__(self, data):
        for key, value in data.items():
            setattr(self, key, value)

class ChartPoint:
    def __init__(self, data):
        for key, value in data.items():
            setattr(self, key, value)

stock = Stock(dict(stock_data)) if stock_data else None
news = [NewsArticle(dict(n)) for n in news_data]
chart = [ChartPoint(dict(c)) for c in chart_data]

${code}

_policy_result = None
if 'evaluate' in dir():
    try:
        _policy_result = evaluate(stock, news)
    except Exception as e:
        _policy_result = {"error": str(e)}
`

  try {
    pyodide.globals.set('stock_data', pyodide.toPy(stockData || {}))
    pyodide.globals.set('news_data', pyodide.toPy(newsData || []))
    pyodide.globals.set('chart_data', pyodide.toPy(chartData || []))

    await pyodide.runPythonAsync(wrapperCode)

    const rawResult = pyodide.globals.get('_policy_result')
    const result = pyToJs(rawResult)

    if (result && result.error) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      result: result,
    }
  } catch (err) {
    return {
      success: false,
      error: err.message,
      error_type: 'PythonError',
    }
  }
}

export async function runPythonBacktest(code, chartData, initialBalance = 10000) {
  const pyodide = await loadPyodideEngine()

  const wrapperCode = `
import json

class ChartPoint:
    def __init__(self, data):
        for key, value in data.items():
            setattr(self, key, value)

chart = [ChartPoint(dict(c)) for c in chart_data]

${code}

_backtest_result = None
trades = []
balance = initial_balance
shares = 0
entry_price = 0
peak_balance = initial_balance
total_trades = 0
winning_trades = 0

for i in range(len(chart)):
    point = chart[i]
    stock_data = {
        "price": point.close,
        "change_pct": 0,
        "volume": point.volume,
    }
    if i > 0:
        prev = chart[i-1]
        stock_data["change_pct"] = ((point.close - prev.close) / prev.close) * 100 if prev.close else 0

    class TempStock:
        def __init__(self, d):
            for k, v in d.items():
                setattr(self, k, v)

    temp_stock = TempStock(stock_data)

    try:
        result = evaluate(temp_stock, [])
        score = result.get("score", 0) if isinstance(result, dict) else 0
    except:
        score = 0

    if score > 0 and shares == 0:
        shares = balance / point.close
        entry_price = point.close
        balance = 0
    elif score <= 0 and shares > 0:
        sale = shares * point.close
        pnl = sale - (shares * entry_price)
        if pnl > 0:
            winning_trades += 1
        total_trades += 1
        trades.append({
            "buy_price": round(entry_price, 2),
            "sell_price": round(point.close, 2),
            "shares": round(shares, 4),
            "pnl": round(pnl, 2),
            "pnl_pct": round((pnl / (shares * entry_price)) * 100, 2) if entry_price else 0,
            "date": point.date,
        })
        balance = sale
        shares = 0
        entry_price = 0

    total_value = balance + (shares * point.close)
    if total_value > peak_balance:
        peak_balance = total_value

if shares > 0 and len(chart) > 0:
    last_price = chart[-1].close
    total_value = balance + (shares * last_price)
    pnl = total_value - initial_balance
    if pnl > 0:
        winning_trades += 1
    total_trades += 1
    trades.append({
        "buy_price": round(entry_price, 2),
        "sell_price": round(last_price, 2),
        "shares": round(shares, 4),
        "pnl": round(pnl, 2),
        "pnl_pct": round((pnl / (shares * entry_price)) * 100, 2) if entry_price else 0,
        "date": chart[-1].date,
        "status": "open",
    })
    balance = total_value
    shares = 0
else:
    total_value = balance

_backtest_result = {
    "initial_balance": initial_balance,
    "final_balance": round(total_value, 2),
    "total_return": round(total_value - initial_balance, 2),
    "total_return_pct": round(((total_value - initial_balance) / initial_balance) * 100, 2),
    "peak_balance": round(peak_balance, 2),
    "max_drawdown_pct": round(((peak_balance - total_value) / peak_balance) * 100, 2) if peak_balance > 0 else 0,
    "total_trades": total_trades,
    "winning_trades": winning_trades,
    "win_rate": round((winning_trades / total_trades) * 100, 1) if total_trades > 0 else 0,
    "trades": trades,
}
`

  try {
    pyodide.globals.set('chart_data', pyodide.toPy(chartData))
    pyodide.globals.set('initial_balance', initialBalance)

    await pyodide.runPythonAsync(wrapperCode)

    const rawResult = pyodide.globals.get('_backtest_result')
    const result = pyToJs(rawResult)

    return {
      success: true,
      backtest: result,
    }
  } catch (err) {
    return {
      success: false,
      error: err.message,
      error_type: 'PythonError',
    }
  }
}