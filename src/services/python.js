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

function escapeForPython(obj) {
  return JSON.stringify(obj).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')
}

export async function runPythonPolicy(code, stockData, newsData, chartData) {
  const pyodide = await loadPyodideEngine()

  const stockJson = escapeForPython(stockData)
  const newsJson = escapeForPython(newsData)
  const chartJson = escapeForPython(chartData)

  const wrapperCode = `
import json

stock_data = json.loads('${stockJson}')
news_data = json.loads('${newsJson}')
chart_data = json.loads('${chartJson}')

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

stock = Stock(stock_data) if stock_data else None
news = [NewsArticle(n) for n in news_data]
chart = [ChartPoint(c) for c in chart_data]

${code}

if 'evaluate' in dir():
    result = evaluate(stock, news)
    json.dumps({"success": True, "result": result}, default=str)
else:
    json.dumps({"success": False, "error": "No evaluate() function defined"})
`

  try {
    const output = await pyodide.runPythonAsync(wrapperCode)
    const result = JSON.parse(output)
    return {
      success: result.success,
      result: result.result,
      error: result.error,
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

  const chartJson = escapeForPython(chartData)

  const wrapperCode = `
import json

chart_data = json.loads('${chartJson}')
initial_balance = ${initialBalance}

class ChartPoint:
    def __init__(self, data):
        for key, value in data.items():
            setattr(self, key, value)

chart = [ChartPoint(c) for c in chart_data]

${code}

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

json.dumps({
    "success": True,
    "backtest": {
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
})
`

  try {
    const output = await pyodide.runPythonAsync(wrapperCode)
    const result = JSON.parse(output)
    return {
      success: result.success,
      backtest: result.backtest,
    }
  } catch (err) {
    return {
      success: false,
      error: err.message,
      error_type: 'PythonError',
    }
  }
}
