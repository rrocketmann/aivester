import { useState, useCallback, useRef, useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
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
        lower = article["title"].lower()
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

function generateChartData(basePrice, trend, days) {
  const points = []
  let price = basePrice * 0.94
  for (let i = days; i >= 0; i--) {
    const noise = (Math.random() - 0.48) * basePrice * 0.015
    price += trend * (days / 30) + noise
    price = Math.max(price, basePrice * 0.82)
    const date = new Date()
    date.setDate(date.getDate() - i)
    points.push({
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      price: Math.round(price * 100) / 100,
      volume: Math.floor(Math.random() * 40000000 + 10000000),
    })
  }
  return points
}

const DAY_MAP = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365 }

const STOCK_DATA = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 189.84, change: 3.21, change_pct: 1.72, volume: 54200000, avg_volume: 48000000, trend: 0.12 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 878.37, change: 14.52, change_pct: 1.68, volume: 41000000, avg_volume: 38000000, trend: 0.55 },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 248.42, change: -5.18, change_pct: -2.04, volume: 82000000, avg_volume: 60000000, trend: -0.18 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 417.88, change: 2.34, change_pct: 0.56, volume: 22000000, avg_volume: 25000000, trend: 0.08 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 174.13, change: -1.09, change_pct: -0.62, volume: 18900000, avg_volume: 21000000, trend: -0.05 },
]

const ALL_NEWS = [
  { title: "Apple beats Q4 earnings estimates with record iPhone revenue", source: "Reuters", time: "2h ago", symbols: ['AAPL'] },
  { title: "NVIDIA surge continues as AI chip demand skyrockets", source: "Bloomberg", time: "3h ago", symbols: ['NVDA'] },
  { title: "Tesla deliveries miss estimates amid production delays", source: "CNBC", time: "4h ago", symbols: ['TSLA'] },
  { title: "Microsoft cloud growth hits record high in quarterly results", source: "WSJ", time: "5h ago", symbols: ['MSFT'] },
  { title: "Alphabet faces antitrust ruling that could reshape search market", source: "FT", time: "6h ago", symbols: ['GOOGL'] },
  { title: "Fed signals potential rate cut as inflation data comes in soft", source: "Reuters", time: "7h ago", symbols: [] },
  { title: "Semiconductor stocks rally on broad-based chip demand", source: "MarketWatch", time: "8h ago", symbols: ['NVDA'] },
  { title: "Oil prices drop on OPEC production increase plans", source: "Bloomberg", time: "9h ago", symbols: [] },
  { title: "Apple Vision Pro sales beat expectations in first quarter", source: "CNBC", time: "10h ago", symbols: ['AAPL'] },
  { title: "Tesla announces new battery technology with 50% more range", source: "Reuters", time: "11h ago", symbols: ['TSLA'] },
  { title: "Microsoft Azure wins major Pentagon cloud contract", source: "WSJ", time: "12h ago", symbols: ['MSFT'] },
  { title: "NVIDIA announces next-gen GPU architecture at GTC", source: "Bloomberg", time: "1d ago", symbols: ['NVDA'] },
]

function getRelevantNews(selectedStock) {
  const stock = STOCK_DATA.find(s => s.symbol === selectedStock)
  if (!stock) return ALL_NEWS
  const stockName = stock.name.toLowerCase().split(' ')[0]
  const relevant = ALL_NEWS.filter(n => {
    const lower = n.title.toLowerCase()
    return lower.includes(selectedStock.toLowerCase()) || lower.includes(stockName)
  })
  const rest = ALL_NEWS.filter(n => !relevant.includes(n))
  return [...relevant, ...rest]
}

function runPolicy(code, selectedStock, period) {
  const stock = STOCK_DATA.find(s => s.symbol === selectedStock) || STOCK_DATA[0]
  const output = []
  output.push({ type: 'info', text: `> Evaluating ${stock.symbol} — ${stock.name}` })
  output.push({ type: 'info', text: `  Price: $${stock.price.toFixed(2)}  Change: ${stock.change_pct > 0 ? '+' : ''}${stock.change_pct.toFixed(2)}%` })
  output.push({ type: 'info', text: `  Volume: ${(stock.volume / 1e6).toFixed(1)}M (avg: ${(stock.avg_volume / 1e6).toFixed(1)}M)` })
  output.push({ type: 'info', text: `  Period: ${period}` })
  output.push({ type: 'info', text: '' })

  const signals = []
  if (stock.change_pct > 2) signals.push('STRONG_UPTREND')
  else if (stock.change_pct > 0) signals.push('UPTREND')
  else if (stock.change_pct < -2) signals.push('STRONG_DOWNTREND')
  else signals.push('DOWNTREND')

  if (stock.volume > stock.avg_volume * 1.5) signals.push('VOLUME_SPIKE')

  const positive_words = ['beat', 'surge', 'growth', 'record', 'upgrade']
  const negative_words = ['miss', 'drop', 'decline', 'cut', 'downgrade']

  const news = getRelevantNews(selectedStock).slice(0, 5)
  news.forEach(article => {
    const lower = article.title.toLowerCase()
    if (positive_words.some(w => lower.includes(w))) signals.push('POSITIVE_NEWS')
    if (negative_words.some(w => lower.includes(w))) signals.push('NEGATIVE_NEWS')
  })

  const positive = signals.filter(s => s.includes('UP') || s.includes('POSITIVE')).length
  const negative = signals.filter(s => s.includes('DOWN') || s.includes('NEGATIVE')).length
  const score = positive - negative

  output.push({ type: 'info', text: `Signals detected:` })
  signals.forEach(s => {
    const type = (s.includes('UP') || s.includes('POSITIVE')) ? 'success' : (s.includes('DOWN') || s.includes('NEGATIVE')) ? 'error' : 'info'
    output.push({ type, text: `  [${s}]` })
  })
  output.push({ type: 'info', text: '' })
  output.push({ type: 'info', text: `Result for ${stock.symbol}:` })
  output.push({ type: score > 0 ? 'success' : score < 0 ? 'error' : 'info', text: `  Score: ${score > 0 ? '+' : ''}${score} — ${score > 0 ? 'BULLISH' : score < 0 ? 'BEARISH' : 'NEUTRAL'}` })
  output.push({ type: 'info', text: '' })
  output.push({ type: 'success', text: 'Policy evaluation complete.' })
  return output
}

function StockChart({ stock, period }) {
  const isPositive = stock.change_pct >= 0
  const color = isPositive ? '#22c55e' : '#ef4444'
  const days = DAY_MAP[period]
  const chart = useMemo(() => generateChartData(stock.price, stock.trend, days), [stock.symbol, period])

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div className="chart-stock-info">
          <div className="chart-symbol">{stock.symbol}</div>
          <div className="chart-name">{stock.name}</div>
        </div>
        <div className="chart-price-block">
          <span className="chart-price">${stock.price.toFixed(2)}</span>
          <span className={`chart-change ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? '+' : ''}{stock.change_pct.toFixed(2)}%
          </span>
        </div>
      </div>
      <div className="chart-area">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chart} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={50} />
            <Tooltip
              contentStyle={{ fontSize: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}
              formatter={(v) => [`$${v.toFixed(2)}`, 'Price']}
            />
            <Area type="monotone" dataKey="price" stroke={color} fill={color} fillOpacity={0.08} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-stats">
        <div className="chart-stat">
          <div className="chart-stat-label">Volume</div>
          <div className="chart-stat-value">{(stock.volume / 1e6).toFixed(1)}M</div>
        </div>
        <div className="chart-stat">
          <div className="chart-stat-label">Avg Volume</div>
          <div className="chart-stat-value">{(stock.avg_volume / 1e6).toFixed(1)}M</div>
        </div>
        <div className="chart-stat">
          <div className="chart-stat-label">Change</div>
          <div className={`chart-stat-value ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? '+' : ''}${stock.change.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [selectedStock, setSelectedStock] = useState('AAPL')
  const [period, setPeriod] = useState('1M')
  const [results, setResults] = useState([
    { type: 'info', text: '> Press Run to evaluate policy on selected stock' },
    { type: 'info', text: '> Select a stock tab to change the evaluation target' },
  ])
  const [terminal, setTerminal] = useState([
    { type: 'system', text: '$ aivester v0.1.0' },
    { type: 'system', text: '$ Ready.' },
  ])
  const [isRunning, setIsRunning] = useState(false)
  const fileInputRef = useRef(null)

  const activeStock = STOCK_DATA.find(s => s.symbol === selectedStock) || STOCK_DATA[0]
  const news = useMemo(() => getRelevantNews(selectedStock), [selectedStock])

  const handleRun = useCallback(() => {
    setIsRunning(true)
    setTerminal(prev => [...prev, { type: 'system', text: `$ aivester run --symbol ${selectedStock} --period ${period}` }])
    setResults([{ type: 'info', text: '> Running policy...' }])
    setTimeout(() => {
      const result = runPolicy(code, selectedStock, period)
      setResults(result)
      setTerminal(prev => [
        ...prev,
        { type: 'success', text: `  Evaluated ${selectedStock} over ${period}` },
        { type: 'success', text: `  Score: ${result[result.length - 2]?.text?.trim() || 'done'}` },
        { type: 'system', text: '$ Done.' },
      ])
      setIsRunning(false)
    }, 600)
  }, [code, selectedStock, period])

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
              {STOCK_DATA.map(stock => (
                <div
                  key={stock.symbol}
                  className={`stock-tab ${selectedStock === stock.symbol ? 'active' : ''}`}
                  onClick={() => setSelectedStock(stock.symbol)}
                >
                  {stock.symbol}
                </div>
              ))}
            </div>
            <StockChart stock={activeStock} period={period} />
          </div>
          <div className="panel news-panel">
            <div className="panel-header">News</div>
            <div className="news-list">
              {news.map((article, i) => {
                const lower = article.title.toLowerCase()
                const isRelevant = lower.includes(selectedStock.toLowerCase()) || lower.includes(activeStock.name.toLowerCase().split(' ')[0].toLowerCase())
                return (
                  <div key={i} className={`news-item ${isRelevant ? 'relevant' : ''}`}>
                    <div className="news-headline">{article.title}</div>
                    <div className="news-meta">
                      <span className="news-source">{article.source}</span> · {article.time}
                    </div>
                  </div>
                )
              })}
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