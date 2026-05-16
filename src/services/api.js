const CORS_PROXY = 'https://corsproxy.io/?'
const YAHOO_BASE = 'https://query1.finance.yahoo.com'

const PERIOD_MAP = {
  '1D': { range: '1d', interval: '5m' },
  '1W': { range: '5d', interval: '1h' },
  '1M': { range: '1mo', interval: '1d' },
  '3M': { range: '3mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return ''
  const now = Date.now() / 1000
  const diff = now - timestamp
  if (diff < 0) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return `${Math.floor(diff / 604800)}w ago`
}

function formatDate(date, period) {
  const d = new Date(date)
  const showTime = period === '1D'
  const showYear = period === '1Y'
  const yearStr = showYear ? `/${d.getFullYear().toString().slice(-2)}` : ''
  return showTime
    ? `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    : `${d.getMonth() + 1}/${d.getDate()}${yearStr}`
}

async function yahooFetch(url) {
  const res = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
  return res.json()
}

export async function fetchQuote(symbol) {
  const data = await yahooFetch(`${YAHOO_BASE}/v8/finance/chart/${symbol}?range=1d&interval=1d`)
  const result = data.chart.result[0]
  const meta = result.meta
  const prevClose = meta.chartPreviousClose || meta.previousClose
  const price = meta.regularMarketPrice
  const change = price - prevClose
  const changePct = prevClose ? (change / prevClose) * 100 : 0

  return {
    symbol: meta.symbol,
    name: meta.longName || meta.shortName,
    price,
    change: Math.round(change * 100) / 100,
    change_pct: Math.round(changePct * 100) / 100,
    volume: meta.regularMarketVolume,
    avg_volume: 0,
    high: meta.regularMarketDayHigh,
    low: meta.regularMarketDayLow,
    open: result.indicators?.quote?.[0]?.open?.[0],
    prev_close: prevClose,
    market_cap: meta.marketCap,
    pe_ratio: null,
    week_52_high: meta.fiftyTwoWeekHigh,
    week_52_low: meta.fiftyTwoWeekLow,
  }
}

export async function fetchChart(symbol, period = '1M') {
  const { range, interval } = PERIOD_MAP[period] || PERIOD_MAP['1M']
  const data = await yahooFetch(`${YAHOO_BASE}/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`)
  const result = data.chart.result[0]
  const timestamps = result.timestamp
  const quotes = result.indicators.quote[0]

  return timestamps.map((ts, i) => ({
    date: formatDate(new Date(ts * 1000), period),
    price: quotes.close[i] ? Math.round(quotes.close[i] * 100) / 100 : null,
    volume: quotes.volume[i] || 0,
    open: quotes.open[i] ? Math.round(quotes.open[i] * 100) / 100 : null,
    high: quotes.high[i] ? Math.round(quotes.high[i] * 100) / 100 : null,
    low: quotes.low[i] ? Math.round(quotes.low[i] * 100) / 100 : null,
    close: quotes.close[i] ? Math.round(quotes.close[i] * 100) / 100 : null,
  })).filter(p => p.price !== null)
}

export async function fetchNews(symbol) {
  const data = await yahooFetch(`${YAHOO_BASE}/v1/finance/search?q=${symbol}&newsCount=10`)
  return (data.news || []).map(item => ({
    title: item.title,
    source: item.publisher || 'Unknown',
    time: formatTimeAgo(item.providerPublishTime),
    url: item.link,
    symbols: [symbol],
    published_at: item.providerPublishTime
      ? new Date(item.providerPublishTime * 1000).toISOString()
      : null,
  }))
}

export async function fetchStocks(symbols) {
  const results = []
  for (const symbol of symbols) {
    try {
      const quote = await fetchQuote(symbol)
      results.push(quote)
      await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      console.warn(`Failed to fetch ${symbol}:`, err.message)
    }
  }
  return results
}
