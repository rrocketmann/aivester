import express from 'express'
import cors from 'cors'
import { registry } from './providers/registry.js'
import { stockService } from './services/stockService.js'
import config from './config/index.js'

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.stack)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason)
  process.exit(1)
})

await registry.init(config.dataProvider, 'mock')

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', provider: config.dataProvider })
})

app.get('/api/stocks', async (req, res) => {
  console.log('Fetching stocks...')
  try {
    const symbols = req.query.symbols
      ? req.query.symbols.split(',').map((s) => s.trim().toUpperCase())
      : config.defaultStocks
    console.log('Symbols:', symbols)
    const stocks = await stockService.getStocks(symbols)
    console.log('Got', stocks.length, 'stocks')
    res.json(stocks)
  } catch (err) {
    console.error('Error:', err.stack)
    res.status(500).json({ error: err.message })
  }
})

const PORT = config.port
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
