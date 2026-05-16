import express from 'express'
import cors from 'cors'
import { registry } from './providers/registry.js'
import { stockService } from './services/stockService.js'
import { policyEngine, PolicyEngineError } from './services/policyEngine.js'
import config from './config/index.js'

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.stack)
})

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason)
})

await registry.init(config.dataProvider, 'mock')

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: config.dataProvider,
    cache: config.cache.enabled,
    providers: registry.listProviders(),
  })
})

app.get('/api/stocks', async (req, res) => {
  try {
    const symbols = req.query.symbols
      ? req.query.symbols.split(',').map((s) => s.trim().toUpperCase())
      : config.defaultStocks
    const stocks = await stockService.getStocks(symbols)
    res.json(stocks)
  } catch (err) {
    console.error('Error fetching stocks:', err.message)
    res.status(500).json({ error: 'Failed to fetch stock data', details: err.message })
  }
})

app.get('/api/stocks/:symbol', async (req, res) => {
  try {
    const stock = await stockService.getStock(req.params.symbol.toUpperCase())
    res.json(stock)
  } catch (err) {
    console.error('Error fetching stock:', err.message)
    res.status(500).json({ error: 'Failed to fetch stock', details: err.message })
  }
})

app.get('/api/stocks/:symbol/chart', async (req, res) => {
  try {
    const { symbol } = req.params
    const period = req.query.period || '1M'
    const chart = await stockService.getChart(symbol.toUpperCase(), period)
    res.json({ symbol: symbol.toUpperCase(), period, chart })
  } catch (err) {
    console.error('Error fetching chart:', err.message)
    res.status(500).json({ error: 'Failed to fetch chart data', details: err.message })
  }
})

app.get('/api/news', async (req, res) => {
  try {
    const symbol = req.query.symbol
    if (symbol) {
      const news = await stockService.getNews(symbol.toUpperCase())
      return res.json(news)
    }
    const stocks = await stockService.getStocks()
    const allNews = []
    const seen = new Set()
    for (const stock of stocks.slice(0, 3)) {
      try {
        const news = await stockService.getNews(stock.symbol)
        for (const item of news) {
          if (!seen.has(item.title)) {
            seen.add(item.title)
            allNews.push(item)
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch news for ${stock.symbol}: ${err.message}`)
      }
    }
    res.json(allNews)
  } catch (err) {
    console.error('Error fetching news:', err.message)
    res.status(500).json({ error: 'Failed to fetch news', details: err.message })
  }
})

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' })
    }
    const results = await stockService.searchStocks(query)
    res.json(results)
  } catch (err) {
    console.error('Error searching stocks:', err.message)
    res.status(500).json({ error: 'Failed to search stocks', details: err.message })
  }
})

app.post('/api/run', async (req, res) => {
  const { code, symbol, period } = req.body
  if (!code) return res.status(400).json({ error: 'Code is required' })
  if (!symbol) return res.status(400).json({ error: 'Symbol is required' })

  try {
    const stock = await stockService.getStock(symbol.toUpperCase())
    const news = await stockService.getNews(symbol.toUpperCase())
    const chart = await stockService.getChart(symbol.toUpperCase(), period || '1M')

    const result = await policyEngine.execute(
      code,
      stock,
      news.slice(0, 10),
      chart,
    )

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        error_type: result.error_type,
        stdout: result.stdout,
      })
    }

    let backtest = null
    try {
      const btResult = await policyEngine.backtest(
        code,
        chart,
        symbol.toUpperCase(),
        10000,
      )
      if (btResult.success && btResult.backtest) {
        backtest = btResult.backtest
      }
    } catch (err) {
      console.warn('Backtest failed:', err.message)
    }

    res.json({
      success: true,
      result: result.result,
      backtest,
      symbol: stock.symbol,
      stock: {
        price: stock.price,
        change_pct: stock.change_pct,
        volume: stock.volume,
      },
    })
  } catch (err) {
    console.error('Error running policy:', err.message)
    if (err instanceof PolicyEngineError) {
      return res.status(400).json({
        error: err.message,
        code: err.code,
        details: err.details,
      })
    }
    res.status(500).json({ error: 'Failed to run policy', details: err.message })
  }
})

app.post('/api/cache/clear', (req, res) => {
  stockService.clearCache()
  res.json({ message: 'Cache cleared' })
})

app.post('/api/cache/invalidate', (req, res) => {
  const { symbol } = req.body
  if (symbol) {
    stockService.invalidateCache(symbol.toUpperCase())
  } else {
    stockService.clearCache()
  }
  res.json({ message: 'Cache invalidated' })
})

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(config.port, () => {
  console.log(`Aivester API running on http://localhost:${config.port}`)
  console.log(`Data provider: ${config.dataProvider}`)
  console.log(`Cache: ${config.cache.enabled ? 'enabled' : 'disabled'} (${config.cache.ttlMs}ms TTL)`)
})
