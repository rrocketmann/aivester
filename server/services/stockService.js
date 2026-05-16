import { registry } from '../providers/registry.js'
import config from '../config/index.js'

class Cache {
  constructor() {
    this.store = new Map()
  }

  get(key) {
    if (!config.cache.enabled) return null
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > config.cache.ttlMs) {
      this.store.delete(key)
      return null
    }
    return entry.data
  }

  set(key, data) {
    if (!config.cache.enabled) return
    this.store.set(key, { data, timestamp: Date.now() })
  }

  invalidate(pattern) {
    for (const key of this.store.keys()) {
      if (pattern && key.includes(pattern)) {
        this.store.delete(key)
      }
    }
  }

  clear() {
    this.store.clear()
  }
}

export const cache = new Cache()

export class StockService {
  async getStocks(symbols = config.defaultStocks) {
    return registry.withFallback(
      async (provider) => {
        const quotes = []
        for (const symbol of symbols) {
          try {
            const cached = cache.get(`quote:${symbol}`)
            if (cached) {
              quotes.push(cached)
              continue
            }
            const quote = await provider.getQuote(symbol)
            cache.set(`quote:${symbol}`, quote)
            quotes.push(quote)
            await new Promise(r => setTimeout(r, 200))
          } catch (err) {
            console.warn(`Failed to fetch ${symbol}: ${err.message}`)
          }
        }
        return quotes
      },
      'getStocks',
    )
  }

  async getStock(symbol) {
    return registry.withFallback(
      async (provider) => {
        const cached = cache.get(`quote:${symbol}`)
        if (cached) return cached
        const quote = await provider.getQuote(symbol)
        cache.set(`quote:${symbol}`, quote)
        return quote
      },
      'getStock',
    )
  }

  async getChart(symbol, period = '1M') {
    return registry.withFallback(
      async (provider) => {
        const cacheKey = `chart:${symbol}:${period}`
        const cached = cache.get(cacheKey)
        if (cached) return cached
        const chart = await provider.getChartHistory(symbol, period)
        cache.set(cacheKey, chart)
        return chart
      },
      'getChart',
    )
  }

  async getNews(symbol) {
    return registry.withFallback(
      async (provider) => {
        const cacheKey = `news:${symbol}`
        const cached = cache.get(cacheKey)
        if (cached) return cached
        const news = await provider.getNews(symbol)
        cache.set(cacheKey, news)
        return news
      },
      'getNews',
    )
  }

  async searchStocks(query) {
    return registry.withFallback(
      async (provider) => provider.searchStocks(query),
      'searchStocks',
    )
  }

  invalidateCache(symbol) {
    cache.invalidate(symbol)
  }

  clearCache() {
    cache.clear()
  }
}

export const stockService = new StockService()
