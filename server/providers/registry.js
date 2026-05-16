import { YahooFinanceProvider } from './yahoo.js'
import { MockProvider } from './mock.js'

const providers = {
  yahoo: YahooFinanceProvider,
  mock: MockProvider,
}

export class ProviderRegistry {
  constructor() {
    this.instances = new Map()
    this.primary = null
    this.fallback = null
  }

  getProvider(name) {
    if (!this.instances.has(name)) {
      const ProviderClass = providers[name]
      if (!ProviderClass) {
        throw new Error(`Unknown provider: ${name}`)
      }
      this.instances.set(name, new ProviderClass())
    }
    return this.instances.get(name)
  }

  async init(primaryName = 'yahoo', fallbackName = 'mock') {
    this.primary = this.getProvider(primaryName)
    this.fallback = this.getProvider(fallbackName)
    console.log(`Data providers initialized: primary=${primaryName}, fallback=${fallbackName}`)
  }

  async withFallback(fn, context = 'operation') {
    try {
      return await fn(this.primary)
    } catch (err) {
      console.warn(`Primary provider failed for ${context}: ${err.message}. Using fallback...`)
      try {
        return await fn(this.fallback)
      } catch (fallbackErr) {
        console.error(`Fallback provider also failed for ${context}: ${fallbackErr.message}`)
        throw err
      }
    }
  }

  getPrimary() {
    return this.primary
  }

  getFallback() {
    return this.fallback
  }

  listProviders() {
    return Object.keys(providers)
  }
}

export const registry = new ProviderRegistry()
