import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dirname, '../.env') })

export default {
  port: parseInt(process.env.PORT, 10) || 3001,
  dataProvider: process.env.DATA_PROVIDER || 'yahoo',
  defaultStocks: (process.env.DEFAULT_STOCKS || 'AAPL,NVDA,TSLA,MSFT,GOOGL,AMZN,META').split(','),
  yahooFinance: {
    logErrors: false,
  },
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttlMs: parseInt(process.env.CACHE_TTL_MS, 10) || 60_000,
  },
  policyEngine: {
    timeoutMs: parseInt(process.env.POLICY_TIMEOUT_MS, 10) || 10_000,
    pythonPath: process.env.PYTHON_PATH || 'python3',
  },
}
