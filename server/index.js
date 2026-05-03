import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

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

const stocks = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 189.84, change: 3.21, change_pct: 1.72, volume: 54200000, avg_volume: 48000000, trend: 0.12 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 878.37, change: 14.52, change_pct: 1.68, volume: 41000000, avg_volume: 38000000, trend: 0.55 },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 248.42, change: -5.18, change_pct: -2.04, volume: 82000000, avg_volume: 60000000, trend: -0.18 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 417.88, change: 2.34, change_pct: 0.56, volume: 22000000, avg_volume: 25000000, trend: 0.08 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 174.13, change: -1.09, change_pct: -0.62, volume: 18900000, avg_volume: 21000000, trend: -0.05 },
]

const news = [
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

app.get('/api/stocks', (req, res) => {
  res.json(stocks)
})

app.get('/api/stocks/:symbol/chart', (req, res) => {
  const { symbol } = req.params
  const period = req.query.period || '1M'
  const days = DAY_MAP[period] || 30
  const stock = stocks.find(s => s.symbol === symbol)
  if (!stock) return res.status(404).json({ error: 'Stock not found' })
  const chart = generateChartData(stock.price, stock.trend || 0.05, days)
  res.json({ symbol, period, chart })
})

app.get('/api/news', (req, res) => {
  const symbol = req.query.symbol
  if (symbol) {
    const stock = stocks.find(s => s.symbol === symbol)
    const relevant = news.filter(n => {
      const lower = n.title.toLowerCase()
      return lower.includes(symbol.toLowerCase()) || (stock && lower.includes(stock.name.toLowerCase().split(' ')[0].toLowerCase()))
    })
    const rest = news.filter(n => !relevant.includes(n))
    return res.json([...relevant, ...rest])
  }
  res.json(news)
})

app.post('/api/run', (req, res) => {
  const { code, symbol, period } = req.body
  const stock = stocks.find(s => s.symbol === symbol) || stocks[0]
  if (!code) return res.status(400).json({ error: 'Code is required' })

  const output = []
  output.push({ type: 'info', text: `> Evaluating ${stock.symbol} — ${stock.name}` })
  output.push({ type: 'info', text: `  Price: $${stock.price.toFixed(2)}  Change: ${stock.change_pct > 0 ? '+' : ''}${stock.change_pct.toFixed(2)}%` })
  output.push({ type: 'info', text: `  Volume: ${(stock.volume / 1e6).toFixed(1)}M (avg: ${(stock.avg_volume / 1e6).toFixed(1)}M)` })
  output.push({ type: 'info', text: `  Period: ${period || '1M'}` })
  output.push({ type: 'info', text: '' })

  const signals = []
  if (stock.change_pct > 2) signals.push('STRONG_UPTREND')
  else if (stock.change_pct > 0) signals.push('UPTREND')
  else if (stock.change_pct < -2) signals.push('STRONG_DOWNTREND')
  else signals.push('DOWNTREND')

  if (stock.volume > stock.avg_volume * 1.5) signals.push('VOLUME_SPIKE')

  const positive_words = ['beat', 'surge', 'growth', 'record', 'upgrade']
  const negative_words = ['miss', 'drop', 'decline', 'cut', 'downgrade']

  const relevantNews = news.filter(n => {
    const title = n.title.toLowerCase()
    return title.includes(stock.symbol.toLowerCase()) || title.includes(stock.name.toLowerCase().split(' ')[0].toLowerCase())
  })
  const allNews = relevantNews.length > 0 ? relevantNews : news.slice(0, 3)

  allNews.forEach(article => {
    const lower = article.title.toLowerCase()
    if (positive_words.some(w => lower.includes(w))) signals.push('POSITIVE_NEWS')
    if (negative_words.some(w => lower.includes(w))) signals.push('NEGATIVE_NEWS')
  })

  output.push({ type: 'info', text: `Signals detected:` })
  signals.forEach(s => {
    const type = (s.includes('UP') || s.includes('POSITIVE')) ? 'success' : (s.includes('DOWN') || s.includes('NEGATIVE')) ? 'error' : 'info'
    output.push({ type, text: `  [${s}]` })
  })
  output.push({ type: 'info', text: '' })

  const positive = signals.filter(s => s.includes('UP') || s.includes('POSITIVE')).length
  const negative = signals.filter(s => s.includes('DOWN') || s.includes('NEGATIVE')).length
  const score = positive - negative

  output.push({ type: 'info', text: `Result for ${stock.symbol}:` })
  output.push({ type: score > 0 ? 'success' : score < 0 ? 'error' : 'info', text: `  Score: ${score > 0 ? '+' : ''}${score} — ${score > 0 ? 'BULLISH' : score < 0 ? 'BEARISH' : 'NEUTRAL'}` })
  output.push({ type: 'info', text: '' })
  output.push({ type: 'success', text: 'Policy evaluation complete.' })

  res.json({ output, signals, score })
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Aivester API running on http://localhost:${PORT}`)
})