import { Hono } from 'hono'
import { verticalNarrativeSignal } from './services/vertical-narrative-signal'
import { walletRiskScorer } from './services/wallet-risk-scorer'
import { nicheTrendPulse } from './services/niche-trend-pulse'
import { agentSignalMonitor } from './services/agent-signal-monitor'

// Empire Router - combines all 4 x402Empire services + smart routing
export const empireRouter = new Hono()

// Mount individual services
empireRouter.route('/vertical-narrative-signal', verticalNarrativeSignal)
empireRouter.route('/wallet-risk-scorer', walletRiskScorer)
empireRouter.route('/niche-trend-pulse', nicheTrendPulse)
empireRouter.route('/agent-signal-monitor', agentSignalMonitor)

// Smart Empire entry point - intelligently routes or combines services
empireRouter.post('/smart', async (c) => {
  const body = await c.req.json()
  const { intent = 'general', vertical, address } = body

  // Example smart routing logic (can be expanded with LLM)
  if (intent.includes('narrative') || intent.includes('signal')) {
    // Could forward to verticalNarrativeSignal internally
    return c.json({ message: 'Use /empire/vertical-narrative-signal', suggestion: 'POST to the specific route' })
  }

  if (intent.includes('risk') || intent.includes('wallet')) {
    return c.json({ message: 'Use /empire/wallet-risk-scorer' })
  }

  // Default combined response
  return c.json({
    empire: 'active',
    available_services: [
      'vertical-narrative-signal',
      'wallet-risk-scorer',
      'niche-trend-pulse',
      'agent-signal-monitor'
    ],
    tip: 'Call the specific service routes directly for best results'
  })
})

empireRouter.get('/', (c) => c.json({
  message: 'x402Empire Router active',
  services: 4,
  usage: 'POST /empire/smart or use individual service routes'
}))