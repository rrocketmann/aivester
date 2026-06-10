import { exec } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import config from '../config/index.js'

const execAsync = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT_DIR = path.resolve(__dirname, '../scripts')

const PYTHON_WRAPPER = `
import json
import sys
import os

stock_data = json.loads(os.environ.get('STOCK_DATA', '{}'))
news_data = json.loads(os.environ.get('NEWS_DATA', '[]'))
chart_data = json.loads(os.environ.get('CHART_DATA', '[]'))

class Stock:
    def __init__(self, data):
        for key, value in data.items():
            setattr(self, key, value)

    def __repr__(self):
        return f"Stock({self.symbol})"

class NewsArticle:
    def __init__(self, data):
        for key, value in data.items():
            setattr(self, key, value)

    def __repr__(self):
        return f"NewsArticle(title={self.title!r})"

class ChartPoint:
    def __init__(self, data):
        for key, value in data.items():
            setattr(self, key, value)

stock = Stock(stock_data) if stock_data else None
news = [NewsArticle(n) for n in news_data]
chart = [ChartPoint(c) for c in chart_data]

USER_CODE_PLACEHOLDER

if 'evaluate' in dir():
    try:
        result = evaluate(stock, news)
        print(json.dumps({"success": True, "result": result}, default=str))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e), "error_type": type(e).__name__}))
else:
    print(json.dumps({"success": False, "error": "No evaluate() function defined in policy"}))
`

const BACKTEST_WRAPPER = `
import json
import sys
import os

chart_data = json.loads(os.environ.get('CHART_DATA', '[]'))
initial_balance = float(os.environ.get('INITIAL_BALANCE', '10000'))

class ChartPoint:
    def __init__(self, data):
        for key, value in data.items():
            setattr(self, key, value)

chart = [ChartPoint(c) for c in chart_data]

USER_CODE_PLACEHOLDER

if 'evaluate' not in dir():
    print(json.dumps({"success": False, "error": "No evaluate() function defined"}))
    sys.exit(0)

trades = []
balance = initial_balance
shares = 0
entry_price = 0
peak_balance = initial_balance
total_trades = 0
winning_trades = 0

for i in range(len(chart)):
    point = chart[i]
    stock_data = {
        "symbol": os.environ.get('SYMBOL', 'UNKNOWN'),
        "price": point.close,
        "change_pct": 0,
        "volume": point.volume,
        "avg_volume": 0,
    }
    if i > 0:
        prev = chart[i-1]
        stock_data["change_pct"] = ((point.close - prev.close) / prev.close) * 100 if prev.close else 0

    class TempStock:
        def __init__(self, d):
            for k, v in d.items():
                setattr(self, k, v)

    temp_stock = TempStock(stock_data)

    try:
        result = evaluate(temp_stock, [])
        score = result.get("score", 0) if isinstance(result, dict) else 0
    except:
        score = 0

    if score > 0 and shares == 0:
        shares = balance / point.close
        entry_price = point.close
        balance = 0
    elif score <= 0 and shares > 0:
        sale = shares * point.close
        pnl = sale - (shares * entry_price)
        if pnl > 0:
            winning_trades += 1
        total_trades += 1
        trades.append({
            "buy_price": round(entry_price, 2),
            "sell_price": round(point.close, 2),
            "shares": round(shares, 4),
            "pnl": round(pnl, 2),
            "pnl_pct": round((pnl / (shares * entry_price)) * 100, 2) if entry_price else 0,
            "date": point.date,
        })
        balance = sale
        shares = 0
        entry_price = 0

    total_value = balance + (shares * point.close)
    if total_value > peak_balance:
        peak_balance = total_value

if shares > 0 and len(chart) > 0:
    last_price = chart[-1].close
    total_value = balance + (shares * last_price)
    pnl = total_value - initial_balance
    if pnl > 0:
        winning_trades += 1
    total_trades += 1
    trades.append({
        "buy_price": round(entry_price, 2),
        "sell_price": round(last_price, 2),
        "shares": round(shares, 4),
        "pnl": round(pnl, 2),
        "pnl_pct": round((pnl / (shares * entry_price)) * 100, 2) if entry_price else 0,
        "date": chart[-1].date,
        "status": "open",
    })
    balance = total_value
    shares = 0
else:
    total_value = balance

print(json.dumps({
    "success": True,
    "backtest": {
        "initial_balance": initial_balance,
        "final_balance": round(total_value, 2),
        "total_return": round(total_value - initial_balance, 2),
        "total_return_pct": round(((total_value - initial_balance) / initial_balance) * 100, 2),
        "peak_balance": round(peak_balance, 2),
        "max_drawdown_pct": round(((peak_balance - total_value) / peak_balance) * 100, 2) if peak_balance > 0 else 0,
        "total_trades": total_trades,
        "winning_trades": winning_trades,
        "win_rate": round((winning_trades / total_trades) * 100, 1) if total_trades > 0 else 0,
        "trades": trades,
    }
}))
`

export class PolicyEngineError extends Error {
  constructor(message, code, details) {
    super(message)
    this.name = 'PolicyEngineError'
    this.code = code
    this.details = details
  }
}

export class PolicyEngine {
  constructor() {
    this.pythonPath = config.policyEngine.pythonPath
    this.timeoutMs = config.policyEngine.timeoutMs
  }

  async execute(code, stockData, newsData, chartData = []) {
    const wrappedCode = this.wrapCode(code)
    const env = {
      ...process.env,
      STOCK_DATA: JSON.stringify(stockData),
      NEWS_DATA: JSON.stringify(newsData),
      CHART_DATA: JSON.stringify(chartData),
      PYTHONIOENCODING: 'utf-8',
    }

    const tmpFile = this.createTempScript(wrappedCode)

    try {
      const { stdout, stderr } = await execAsync(
        `${this.pythonPath} "${tmpFile}"`,
        {
          env,
          timeout: this.timeoutMs,
          maxBuffer: 1024 * 1024,
        },
      )

      if (stderr && !stderr.includes('DeprecationWarning')) {
        console.warn('Python stderr:', stderr)
      }

      return this.parseOutput(stdout)
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new PolicyEngineError(
          `Python not found at ${this.pythonPath}. Install Python or set PYTHON_PATH env var.`,
          'PYTHON_NOT_FOUND',
        )
      }
      if (err.killed) {
        throw new PolicyEngineError(
          `Policy execution timed out after ${this.timeoutMs}ms`,
          'TIMEOUT',
        )
      }
      throw new PolicyEngineError(
        `Policy execution failed: ${err.message}`,
        'EXECUTION_ERROR',
        { stderr: err.stderr },
      )
    } finally {
      this.cleanupTempScript(tmpFile)
    }
  }

  async backtest(code, chartData, symbol, initialBalance = 10000) {
    const wrappedCode = this.wrapBacktestCode(code)
    const env = {
      ...process.env,
      CHART_DATA: JSON.stringify(chartData),
      SYMBOL: symbol,
      INITIAL_BALANCE: String(initialBalance),
      PYTHONIOENCODING: 'utf-8',
    }

    const tmpFile = this.createTempScript(wrappedCode)

    try {
      const { stdout, stderr } = await execAsync(
        `${this.pythonPath} "${tmpFile}"`,
        {
          env,
          timeout: this.timeoutMs * 3,
          maxBuffer: 1024 * 1024,
        },
      )

      if (stderr && !stderr.includes('DeprecationWarning')) {
        console.warn('Python stderr:', stderr)
      }

      return this.parseOutput(stdout)
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new PolicyEngineError(
          `Python not found at ${this.pythonPath}. Install Python or set PYTHON_PATH env var.`,
          'PYTHON_NOT_FOUND',
        )
      }
      if (err.killed) {
        throw new PolicyEngineError(
          `Backtest timed out after ${this.timeoutMs * 3}ms`,
          'TIMEOUT',
        )
      }
      throw new PolicyEngineError(
        `Backtest failed: ${err.message}`,
        'EXECUTION_ERROR',
        { stderr: err.stderr },
      )
    } finally {
      this.cleanupTempScript(tmpFile)
    }
  }

  wrapCode(userCode) {
    return PYTHON_WRAPPER.replace('USER_CODE_PLACEHOLDER', userCode)
  }

  wrapBacktestCode(userCode) {
    return BACKTEST_WRAPPER.replace('USER_CODE_PLACEHOLDER', userCode)
  }

  parseOutput(stdout) {
    const lines = stdout.trim().split('\n')
    const lastLine = lines[lines.length - 1]

    try {
      const result = JSON.parse(lastLine)
      return {
        success: result.success,
        result: result.result,
        backtest: result.backtest,
        error: result.error,
        error_type: result.error_type,
        stdout: lines.slice(0, -1).join('\n'),
      }
    } catch {
      return {
        success: false,
        error: 'Failed to parse policy output',
        stdout: stdout,
      }
    }
  }

  createTempScript(code) {
    if (!fs.existsSync(SCRIPT_DIR)) {
      fs.mkdirSync(SCRIPT_DIR, { recursive: true })
    }
    const tmpFile = path.join(SCRIPT_DIR, `policy_${Date.now()}.py`)
    fs.writeFileSync(tmpFile, code, 'utf-8')
    return tmpFile
  }

  cleanupTempScript(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (err) {
      console.warn('Failed to cleanup temp script:', err.message)
    }
  }

  async validateSyntax(code) {
    try {
      await execAsync(`${this.pythonPath} -c "import ast; ast.parse('''${code.replace(/'/g, "\\'")}''')"`, {
        timeout: 5000,
      })
      return { valid: true }
    } catch (err) {
      return {
        valid: false,
        error: err.stderr || err.message,
      }
    }
  }
}

export const policyEngine = new PolicyEngine()
