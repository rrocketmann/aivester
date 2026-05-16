import { BaseDataProvider } from './base.js'

const MOCK_STOCKS = {
  AAPL: { symbol: 'AAPL', name: 'Apple Inc.', price: 189.84, change: 3.21, change_pct: 1.72, volume: 54200000, avg_volume: 48000000, trend: 0.12 },
  NVDA: { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 878.37, change: 14.52, change_pct: 1.68, volume: 41000000, avg_volume: 38000000, trend: 0.55 },
  TSLA: { symbol: 'TSLA', name: 'Tesla Inc.', price: 248.42, change: -5.18, change_pct: -2.04, volume: 82000000, avg_volume: 60000000, trend: -0.18 },
  MSFT: { symbol: 'MSFT', name: 'Microsoft Corp.', price: 417.88, change: 2.34, change_pct: 0.56, volume: 22000000, avg_volume: 25000000, trend: 0.08 },
  GOOGL: { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 174.13, change: -1.09, change_pct: -0.62, volume: 18900000, avg_volume: 21000000, trend: -0.05 },
}

const MOCK_NEWS = [
  { title: "Apple beats Q4 earnings estimates with record iPhone revenue", source: "Reuters", time: "2h ago", symbols: ['AAPL'] },
  { title: "NVIDIA surge continues as AI chip demand skyrockets", source: "Bloomberg", time: "3h ago", symbols: ['NVDA'] },
  { title: "Tesla deliveries miss estimates amid production delays", source: "CNBC", time: "4h ago", symbols: ['TSLA'] },
  { title: "Microsoft cloud growth hits record high in quarterly results", source: "WSJ", time: "5h ago", symbols: ['MSFT'] },
  { title: "Alphabet faces antitrust ruling that could reshape search market", source: "FT", time: "6h ago", symbols: ['GOOGL'] },
]

export class MockProvider extends BaseDataProvider {
  constructor() {
    super('mock')
  }

  async getQuote(symbol) {
    await this.simulateDelay()
    const stock = MOCK_STOCKS[symbol.toUpperCase()]
    if (!stock) {
      return this.normalizeQuote({
        symbol: symbol.toUpperCase(),
        name: `${symbol.toUpperCase()} Corp.`,
        price: 100 + Math.random() * 200,
        change: (Math.random() - 0.5) * 10,
        change_pct: (Math.random() - 0.5) * 5,
        volume: Math.floor(Math.random() * 50000000),
        avg_volume: Math.floor(Math.random() * 40000000),
      })
    }
    return this.normalizeQuote(stock)
  }

  async getChartHistory(symbol, period = '1M') {
    await this.simulateDelay()
    const stock = MOCK_STOCKS[symbol.toUpperCase()] || { price: 150, trend: 0.05 }
    const days = this.getDaysForPeriod(period)
    const points = []
    let price = stock.price * 0.94

    for (let i = days; i >= 0; i--) {
      const noise = (Math.random() - 0.48) * stock.price * 0.015
      price += (stock.trend || 0.05) * (days / 30) + noise
      price = Math.max(price, stock.price * 0.82)
      const date = new Date()
      date.setDate(date.getDate() - i)
      points.push(this.normalizeChartPoint({
        date: date.toISOString().split('T')[0],
        price: Math.round(price * 100) / 100,
        volume: Math.floor(Math.random() * 40000000 + 10000000),
      }))
    }
    return points
  }

  async getNews(symbol) {
    await this.simulateDelay()
    const relevant = MOCK_NEWS.filter((n) => n.symbols.includes(symbol.toUpperCase()))
    const rest = MOCK_NEWS.filter((n) => !n.symbols.includes(symbol.toUpperCase()))
    return [...relevant, ...rest].map((n) => this.normalizeNewsItem(n))
  }

  async searchStocks(query) {
    await this.simulateDelay()
    const q = query.toLowerCase()
    return Object.values(MOCK_STOCKS)
      .filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .map((s) => ({ symbol: s.symbol, name: s.name, exchange: 'NASDAQ', quoteType: 'EQUITY' }))
  }

  simulateDelay() {
    return new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200))
  }

  getDaysForPeriod(period) {
    const map = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365 }
    return map[period] || 30
  }
}
