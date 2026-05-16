import YahooFinance from 'yahoo-finance2'
import { BaseDataProvider, DataProviderError } from './base.js'

export class YahooFinanceProvider extends BaseDataProvider {
  constructor() {
    super('yahoo')
    this.yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
  }

  async getQuote(symbol) {
    try {
      const quote = await this.yf.quote(symbol)
      if (!quote) {
        throw new DataProviderError(`No data for ${symbol}`, this.name, 'NO_DATA')
      }

      const regularMarketPrice = quote.regularMarketPrice || 0
      const prevClose = quote.regularMarketPreviousClose || regularMarketPrice
      const change = regularMarketPrice - prevClose
      const changePct = prevClose ? (change / prevClose) * 100 : 0

      return this.normalizeQuote({
        symbol: quote.symbol,
        name: quote.longName || quote.shortName || quote.symbol,
        price: regularMarketPrice,
        change: Math.round(change * 100) / 100,
        change_pct: Math.round(changePct * 100) / 100,
        volume: quote.regularMarketVolume || 0,
        avg_volume: quote.averageDailyVolume3Month || 0,
        high: quote.regularMarketDayHigh,
        low: quote.regularMarketDayLow,
        open: quote.regularMarketOpen,
        prev_close: prevClose,
        market_cap: quote.marketCap,
        pe_ratio: quote.trailingPE,
        week_52_high: quote.fiftyTwoWeekHigh,
        week_52_low: quote.fiftyTwoWeekLow,
      })
    } catch (err) {
      if (err instanceof DataProviderError) throw err
      throw new DataProviderError(
        `Failed to fetch quote for ${symbol}: ${err.message}`,
        this.name,
        'FETCH_ERROR',
      )
    }
  }

  async getChartHistory(symbol, period = '1M') {
    try {
      const periodMap = {
        '1D': { range: '1d', interval: '5m' },
        '1W': { range: '5d', interval: '1h' },
        '1M': { range: '1mo', interval: '1d' },
        '3M': { range: '3mo', interval: '1d' },
        '1Y': { range: '1y', interval: '1d' },
      }

      const { range, interval } = periodMap[period] || periodMap['1M']

      const history = await this.yf.chart(symbol, {
        period1: this.getPeriodStartDate(period),
        interval,
      })

      if (!history || !history.quotes || history.quotes.length === 0) {
        throw new DataProviderError(`No chart data for ${symbol}`, this.name, 'NO_DATA')
      }

      return history.quotes
        .filter((q) => q.close != null)
        .map((q) => {
          const date = q.date ? new Date(q.date) : new Date()
          const showTime = period === '1D'
          const showYear = period === '1Y'
          const yearStr = showYear ? `/${date.getFullYear().toString().slice(-2)}` : ''
          const dateStr = showTime
            ? `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
            : `${date.getMonth() + 1}/${date.getDate()}${yearStr}`

          return this.normalizeChartPoint({
            date: dateStr,
            price: Math.round(q.close * 100) / 100,
            volume: q.volume || 0,
            open: q.open ? Math.round(q.open * 100) / 100 : null,
            high: q.high ? Math.round(q.high * 100) / 100 : null,
            low: q.low ? Math.round(q.low * 100) / 100 : null,
            close: Math.round(q.close * 100) / 100,
          })
        })
    } catch (err) {
      if (err instanceof DataProviderError) throw err
      throw new DataProviderError(
        `Failed to fetch chart for ${symbol}: ${err.message}`,
        this.name,
        'FETCH_ERROR',
      )
    }
  }

  async getNews(symbol) {
    try {
      const news = await this.yf.search(symbol, {
        newsCount: 10,
      })

      if (!news || !news.news || news.news.length === 0) {
        return []
      }

      return news.news.map((item) =>
        this.normalizeNewsItem({
          title: item.title,
          source: item.publisher || 'Unknown',
          time: this.formatTimeAgo(item.providerPublishTime),
          url: item.link,
          symbols: [symbol],
          published_at: item.providerPublishTime
            ? (item.providerPublishTime instanceof Date
                ? item.providerPublishTime.toISOString()
                : new Date(item.providerPublishTime).toISOString())
            : null,
        }),
      )
    } catch (err) {
      if (err instanceof DataProviderError) throw err
      throw new DataProviderError(
        `Failed to fetch news for ${symbol}: ${err.message}`,
        this.name,
        'FETCH_ERROR',
      )
    }
  }

  async searchStocks(query) {
    try {
      const results = await this.yf.search(query)
      if (!results || !results.quotes) return []

      return results.quotes
        .filter((q) => q.quoteType === 'EQUITY' && q.isYahooFinance)
        .slice(0, 10)
        .map((q) => ({
          symbol: q.symbol,
          name: q.longname || q.shortname || q.symbol,
          exchange: q.exchange,
          quoteType: q.quoteType,
        }))
    } catch (err) {
      throw new DataProviderError(
        `Failed to search stocks: ${err.message}`,
        this.name,
        'FETCH_ERROR',
      )
    }
  }

  getPeriodStartDate(period) {
    const now = new Date()
    const map = {
      '1D': 1,
      '1W': 7,
      '1M': 30,
      '3M': 90,
      '1Y': 365,
    }
    const days = map[period] || 30
    now.setDate(now.getDate() - days)
    return now
  }

  formatTimeAgo(timestamp) {
    if (!timestamp) return ''
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
    if (isNaN(date.getTime())) return ''
    const now = Date.now()
    const diff = (now - date.getTime()) / 1000

    if (diff < 0) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return `${Math.floor(diff / 604800)}w ago`
  }
}
