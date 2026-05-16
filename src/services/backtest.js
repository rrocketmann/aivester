export function runBacktest(evaluateFn, chartData, initialBalance = 10000) {
  const trades = []
  let balance = initialBalance
  let shares = 0
  let entryPrice = 0
  let peakBalance = initialBalance
  let totalTrades = 0
  let winningTrades = 0

  for (let i = 0; i < chartData.length; i++) {
    const point = chartData[i]
    const stockData = {
      symbol: 'UNKNOWN',
      price: point.close,
      change_pct: 0,
      volume: point.volume,
      avg_volume: 0,
    }
    if (i > 0) {
      const prev = chartData[i - 1]
      stockData.change_pct = prev.close ? ((point.close - prev.close) / prev.close) * 100 : 0
    }

    let score = 0
    try {
      const result = evaluateFn(stockData, [])
      score = result && typeof result === 'object' ? (result.score || 0) : 0
    } catch {
      score = 0
    }

    if (score > 0 && shares === 0) {
      shares = balance / point.close
      entryPrice = point.close
      balance = 0
    } else if (score <= 0 && shares > 0) {
      const sale = shares * point.close
      const pnl = sale - (shares * entryPrice)
      if (pnl > 0) winningTrades++
      totalTrades++
      trades.push({
        buy_price: Math.round(entryPrice * 100) / 100,
        sell_price: Math.round(point.close * 100) / 100,
        shares: Math.round(shares * 10000) / 10000,
        pnl: Math.round(pnl * 100) / 100,
        pnl_pct: entryPrice ? Math.round((pnl / (shares * entryPrice)) * 10000) / 100 : 0,
        date: point.date,
      })
      balance = sale
      shares = 0
      entryPrice = 0
    }

    const totalValue = balance + (shares * point.close)
    if (totalValue > peakBalance) {
      peakBalance = totalValue
    }
  }

  if (shares > 0 && chartData.length > 0) {
    const lastPrice = chartData[chartData.length - 1].close
    const totalValue = balance + (shares * lastPrice)
    const pnl = totalValue - initialBalance
    if (pnl > 0) winningTrades++
    totalTrades++
    trades.push({
      buy_price: Math.round(entryPrice * 100) / 100,
      sell_price: Math.round(lastPrice * 100) / 100,
      shares: Math.round(shares * 10000) / 10000,
      pnl: Math.round(pnl * 100) / 100,
      pnl_pct: entryPrice ? Math.round((pnl / (shares * entryPrice)) * 10000) / 100 : 0,
      date: chartData[chartData.length - 1].date,
      status: 'open',
    })
    balance = totalValue
    shares = 0
  }

  const totalValue = balance
  return {
    initial_balance: initialBalance,
    final_balance: Math.round(totalValue * 100) / 100,
    total_return: Math.round((totalValue - initialBalance) * 100) / 100,
    total_return_pct: Math.round(((totalValue - initialBalance) / initialBalance) * 10000) / 100,
    peak_balance: Math.round(peakBalance * 100) / 100,
    max_drawdown_pct: peakBalance > 0 ? Math.round(((peakBalance - totalValue) / peakBalance) * 10000) / 100 : 0,
    total_trades: totalTrades,
    winning_trades: winningTrades,
    win_rate: totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 1000) / 10 : 0,
    trades,
  }
}
