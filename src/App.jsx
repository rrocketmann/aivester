import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { fetchStocks, fetchChart, fetchNews } from './services/api'
import { runPythonPolicy, runPythonBacktest, loadPyodideEngine } from './services/python'
import './App.css'

const DEFAULT_CODE = `# Aivester Policy: Momentum Scanner
# Evaluate stocks based on momentum and sentiment

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
`

const TIME_PERIODS = ['1D', '1W', '1M', '3M', '1Y']
const INTERVAL_OPTIONS = [
  { value: 'every', label: 'Every Bar' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
]
const DEFAULT_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META']

function StockChart({ stock, period, chartData }) {
  const periodChange = useMemo(() => {
    if (!chartData || chartData.length < 2) return null
    const first = chartData[0].price
    const last = chartData[chartData.length - 1].price
    const change = last - first
    const changePct = (change / first) * 100
    return { change, changePct }
  }, [chartData])

  const displayChangePct = periodChange?.changePct ?? stock?.change_pct
  const isPositive = displayChangePct >= 0
  const color = isPositive ? '#22c55e' : '#ef4444'

  if (!stock || !chartData) {
    return (
      <div className="chart-container">
        <div className="chart-loading">Loading chart data...</div>
      </div>
    )
  }

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div className="chart-stock-info">
          <div className="chart-symbol">{stock.symbol}</div>
          <div className="chart-name">{stock.name}</div>
        </div>
        <div className="chart-price-block">
          <span className="chart-price">${stock.price?.toFixed(2)}</span>
          <span className={`chart-change ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? '+' : ''}{displayChangePct?.toFixed(2)}%
          </span>
        </div>
      </div>
      <div className="chart-area">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={5}
            />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={50} />
            <Tooltip
              contentStyle={{ fontSize: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}
              formatter={(v) => [`$${v?.toFixed(2)}`, 'Price']}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Area type="monotone" dataKey="price" stroke={color} fill={color} fillOpacity={0.08} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-stats">
        <div className="chart-stat">
          <div className="chart-stat-label">Volume</div>
          <div className="chart-stat-value">{stock.volume ? (stock.volume / 1e6).toFixed(1) + 'M' : 'N/A'}</div>
        </div>
        <div className="chart-stat">
          <div className="chart-stat-label">Avg Volume</div>
          <div className="chart-stat-value">{stock.avg_volume ? (stock.avg_volume / 1e6).toFixed(1) + 'M' : 'N/A'}</div>
        </div>
        <div className="chart-stat">
          <div className="chart-stat-label">Change</div>
          <div className={`chart-stat-value ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? '+' : ''}${stock.change?.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [stocks, setStocks] = useState([])
  const [selectedStock, setSelectedStock] = useState(null)
  const [period, setPeriod] = useState('1M')
  const [interval, setInterval_] = useState('daily')
  const [chartData, setChartData] = useState([])
  const [news, setNews] = useState([])
  const [results, setResults] = useState([
    { type: 'info', text: '> Press Run to evaluate policy on selected stock' },
    { type: 'info', text: '> Select a stock tab to change the evaluation target' },
  ])
  const [terminal, setTerminal] = useState([
    { type: 'system', text: '$ aivester v0.3.0 — Frontend Only' },
    { type: 'system', text: '$ Loading Python engine...' },
  ])
  const [isRunning, setIsRunning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pyodideReady, setPyodideReady] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    async function init() {
      try {
        setLoading(true)
        setError(null)
        const [stocksData] = await Promise.all([
          fetchStocks(DEFAULT_SYMBOLS),
          loadPyodideEngine().then(() => setPyodideReady(true)),
        ])
        setStocks(stocksData)
        if (stocksData.length > 0) {
          setSelectedStock(stocksData[0].symbol)
        }
        setTerminal(prev => [...prev, { type: 'success', text: '$ Live market data connected.' }])
        setTerminal(prev => [...prev, { type: 'success', text: '$ Python engine ready.' }])
      } catch (err) {
        setError(err.message)
        setTerminal(prev => [...prev, { type: 'error', text: `$ Error: ${err.message}` }])
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!selectedStock) return

    async function loadData() {
      try {
        const [chart, newsData] = await Promise.all([
          fetchChart(selectedStock, period),
          fetchNews(selectedStock),
        ])
        setChartData(chart || [])
        setNews(newsData || [])
      } catch (err) {
        setTerminal(prev => [...prev, { type: 'error', text: `$ Failed to load data: ${err.message}` }])
      }
    }
    loadData()
  }, [selectedStock, period])

  const activeStock = useMemo(
    () => stocks.find(s => s.symbol === selectedStock),
    [stocks, selectedStock]
  )

  const handleRun = useCallback(async () => {
    if (!selectedStock) return
    setIsRunning(true)
    setTerminal(prev => [...prev, { type: 'system', text: `$ aivester run --symbol ${selectedStock} --period ${period}` }])
    setResults([{ type: 'info', text: '> Running policy...' }])

    try {
      const stock = activeStock || { symbol: selectedStock, price: 0, change_pct: 0, volume: 0, avg_volume: 0 }

      const policyResult = await runPythonPolicy(code, stock, news.slice(0, 10), chartData)

      if (!policyResult.success) {
        setResults([
          { type: 'error', text: `> Policy execution failed: ${policyResult.error}` },
        ])
        setTerminal(prev => [
          ...prev,
          { type: 'error', text: `  Error: ${policyResult.error}` },
          { type: 'system', text: '$ Done.' },
        ])
        return
      }

      const result = policyResult.result
      const output = []
      output.push({ type: 'info', text: `> Evaluating ${selectedStock} — ${activeStock?.name || ''}` })
      output.push({ type: 'info', text: `  Price: $${stock.price?.toFixed(2)}  Change: ${stock.change_pct > 0 ? '+' : ''}${stock.change_pct?.toFixed(2)}%` })
      output.push({ type: 'info', text: `  Volume: ${stock.volume ? (stock.volume / 1e6).toFixed(1) + 'M' : 'N/A'}` })
      output.push({ type: 'info', text: `  Period: ${period}` })
      output.push({ type: 'info', text: '' })

      if (result.signals && Array.isArray(result.signals)) {
        output.push({ type: 'info', text: `Signals detected:` })
        result.signals.forEach(s => {
          const type = (s.includes('UP') || s.includes('POSITIVE')) ? 'success' : (s.includes('DOWN') || s.includes('NEGATIVE')) ? 'error' : 'info'
          output.push({ type, text: `  [${s}]` })
        })
        output.push({ type: 'info', text: '' })
      }

      const score = result.score ?? 0
      output.push({ type: 'info', text: `Result for ${selectedStock}:` })
      output.push({ type: score > 0 ? 'success' : score < 0 ? 'error' : 'info', text: `  Score: ${score > 0 ? '+' : ''}${score} — ${score > 0 ? 'BULLISH' : score < 0 ? 'BEARISH' : 'NEUTRAL'}` })
      output.push({ type: 'info', text: '' })

      setTerminal(prev => [...prev, { type: 'system', text: '$ Running paper trading backtest...' }])

      const backtestResult = await runPythonBacktest(code, chartData, 10000, interval)

      if (backtestResult.success && backtestResult.backtest) {
        const bt = backtestResult.backtest
        output.push({ type: 'info', text: `─── Paper Trading (${period}, ${interval} decisions) ───` })
        output.push({ type: 'info', text: `  Start: $${bt.initial_balance.toLocaleString()}  →  End: $${bt.final_balance.toLocaleString()}` })
        const returnColor = bt.total_return >= 0 ? 'success' : 'error'
        output.push({ type: returnColor, text: `  Return: ${bt.total_return >= 0 ? '+' : ''}$${bt.total_return.toLocaleString()} (${bt.total_return_pct >= 0 ? '+' : ''}${bt.total_return_pct}%)` })
        output.push({ type: 'info', text: `  Trades: ${bt.total_trades}  |  Win Rate: ${bt.win_rate}%  |  Drawdown: ${bt.max_drawdown_pct}%` })
        output.push({ type: 'info', text: '' })

        if (bt.snapshots && bt.snapshots.length > 0) {
          output.push({ type: 'info', text: `  Step-by-step Portfolio:` })
          bt.snapshots.forEach(s => {
            const valColor = s.value >= bt.initial_balance ? 'success' : 'error'
            const actionStr = s.action === 'BUY' ? 'BUY ' : s.action === 'SELL' ? 'SELL' : 'HOLD'
            output.push({ type: valColor, text: `    ${s.date}  ${actionStr}  $${s.price.toFixed(2)}  Portfolio: $${s.value.toLocaleString()}  (${s.return_pct >= 0 ? '+' : ''}${s.return_pct}%)` })
          })
          output.push({ type: 'info', text: '' })
        }

        if (bt.trades && bt.trades.length > 0) {
          output.push({ type: 'info', text: `  Closed Trades:` })
          bt.trades.forEach((t, i) => {
            const pnlType = t.pnl >= 0 ? 'success' : 'error'
            const status = t.status === 'open' ? ' [OPEN]' : ''
            output.push({ type: 'info', text: `    ${i + 1}. Buy $${t.buy_price} → Sell $${t.sell_price} | ${t.shares.toFixed(2)} shares` })
            output.push({ type: pnlType, text: `       P&L: ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toLocaleString()} (${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct}%)${status}` })
          })
          output.push({ type: 'info', text: '' })
        }
      }

      output.push({ type: 'success', text: 'Policy evaluation complete.' })

      setResults(output)
      setTerminal(prev => [
        ...prev,
        { type: 'success', text: `  Evaluated ${selectedStock} over ${period}` },
        { type: 'success', text: `  Score: ${score > 0 ? '+' : ''}${score}` },
        { type: 'system', text: '$ Done.' },
      ])
    } catch (err) {
      setResults([{ type: 'error', text: `> Request failed: ${err.message}` }])
      setTerminal(prev => [...prev, { type: 'error', text: `$ Error: ${err.message}` }])
    } finally {
      setIsRunning(false)
    }
  }, [code, selectedStock, period, interval, activeStock, chartData, news])

  const handleUpload = useCallback((e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCode(ev.target.result)
      setTerminal(prev => [...prev, { type: 'system', text: `$ loaded: ${file.name}` }])
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  if (loading) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading market data & Python engine...</div>
          {!pyodideReady && <div className="loading-subtext">This may take a moment on first load</div>}
        </div>
      </div>
    )
  }

  if (error && stocks.length === 0) {
    return (
      <div className="app">
        <div className="error-screen">
          <h2>Connection Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="left-col">
        <div className="editor-area">
          <div className="editor-header">
            <div className="editor-header-left">
              <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>
                UPLOAD
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".py,.txt,.js,.ts"
                onChange={handleUpload}
                style={{ display: 'none' }}
              />
            </div>
            <div className="editor-header-right">
              <div className="period-selector">
                {TIME_PERIODS.map(p => (
                  <button
                    key={p}
                    className={`period-btn ${period === p ? 'active' : ''}`}
                    onClick={() => setPeriod(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="interval-selector">
                {INTERVAL_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`period-btn ${interval === opt.value ? 'active' : ''}`}
                    onClick={() => setInterval_(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button className="run-btn" onClick={handleRun} disabled={isRunning}>
                {isRunning ? 'RUNNING...' : 'RUN'}
              </button>
            </div>
          </div>
          <div className="editor-body">
            <CodeMirror
              value={code}
              height="100%"
              theme="light"
              extensions={[python()]}
              onChange={setCode}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                bracketMatching: true,
                indentOnInput: true,
                foldGutter: false,
                highlightSelectionMatches: false,
              }}
            />
          </div>
        </div>
        <div className="bottom-panel">
          <div className="panel-header">Terminal</div>
          <div className="terminal-body">
            {terminal.map((line, i) => (
              <div key={i} className={`terminal-line ${line.type}`}>{line.text}</div>
            ))}
          </div>
        </div>
      </div>
      <div className="right-col">
        <div className="data-area">
          <div className="panel stocks-panel">
            <div className="stock-tabs">
              {stocks.map(stock => (
                <div
                  key={stock.symbol}
                  className={`stock-tab ${selectedStock === stock.symbol ? 'active' : ''}`}
                  onClick={() => setSelectedStock(stock.symbol)}
                >
                  {stock.symbol}
                </div>
              ))}
            </div>
            <StockChart stock={activeStock} period={period} chartData={chartData} />
          </div>
          <div className="panel news-panel">
            <div className="panel-header">News</div>
            <div className="news-list">
              {news.length === 0 ? (
                <div className="news-empty">No news available</div>
              ) : (
                news.map((article, i) => {
                  const lower = article.title?.toLowerCase() || ''
                  const isRelevant = lower.includes(selectedStock?.toLowerCase() || '') || lower.includes(activeStock?.name?.toLowerCase().split(' ')[0] || '')
                  return (
                    <div key={i} className={`news-item ${isRelevant ? 'relevant' : ''}`}>
                      <div className="news-headline">{article.title}</div>
                      <div className="news-meta">
                        <span className="news-source">{article.source}</span> · {article.time}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
        <div className="bottom-panel">
          <div className="panel-header">Results</div>
          <div className="results-body">
            {results.map((line, i) => (
              <div key={i} className={`results-line ${line.type}`}>{line.text}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
