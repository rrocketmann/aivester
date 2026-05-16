export class DataProviderError extends Error {
  constructor(message, provider, code) {
    super(message)
    this.name = 'DataProviderError'
    this.provider = provider
    this.code = code
  }
}

export class BaseDataProvider {
  constructor(name) {
    if (new.target === BaseDataProvider) {
      throw new TypeError('Cannot instantiate BaseDataProvider directly')
    }
    this.name = name
  }

  async getQuote(symbol) {
    throw new DataProviderError('Not implemented', this.name, 'NOT_IMPLEMENTED')
  }

  async getQuotes(symbols) {
    const results = await Promise.allSettled(
      symbols.map((s) => this.getQuote(s)),
    )
    return results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value)
  }

  async getChartHistory(symbol, period) {
    throw new DataProviderError('Not implemented', this.name, 'NOT_IMPLEMENTED')
  }

  async getNews(symbol) {
    throw new DataProviderError('Not implemented', this.name, 'NOT_IMPLEMENTED')
  }

  async searchStocks(query) {
    throw new DataProviderError('Not implemented', this.name, 'NOT_IMPLEMENTED')
  }

  normalizeQuote(raw) {
    return {
      symbol: raw.symbol,
      name: raw.name || raw.symbol,
      price: raw.price || 0,
      change: raw.change || 0,
      change_pct: raw.change_pct || 0,
      volume: raw.volume || 0,
      avg_volume: raw.avg_volume || 0,
      high: raw.high,
      low: raw.low,
      open: raw.open,
      prev_close: raw.prev_close,
      market_cap: raw.market_cap,
      pe_ratio: raw.pe_ratio,
      week_52_high: raw.week_52_high,
      week_52_low: raw.week_52_low,
    }
  }

  normalizeChartPoint(raw) {
    return {
      date: raw.date,
      price: raw.price,
      volume: raw.volume || 0,
      open: raw.open,
      high: raw.high,
      low: raw.low,
      close: raw.close,
    }
  }

  normalizeNewsItem(raw) {
    return {
      title: raw.title,
      source: raw.source || 'Unknown',
      time: raw.time || '',
      url: raw.url,
      symbols: raw.symbols || [],
      sentiment: raw.sentiment,
      published_at: raw.published_at,
    }
  }
}
