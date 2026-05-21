import { Hono } from 'hono'
import { verticalNarrativeSignal } from './services/vertical-narrative-signal'
import { walletRiskScorer } from './services/wallet-risk-scorer'
import { nicheTrendPulse } from './services/niche-trend-pulse'
import { agentSignalMonitor } from './services/agent-signal-monitor'

/**
 * xAI Services Router
 * Collection of high-value, x402-enabled niche tools powered by xAI/Grok.
 * Mounted at /xai/*
 */
export const xaiRouter = new Hono()

// Mount individual xAI-powered services
xaiRouter.route('/vertical-narrative-signal', verticalNarrativeSignal)
xaiRouter.route('/wallet-risk-scorer', walletRiskScorer)
xaiRouter.route('/niche-trend-pulse', nicheTrendPulse)
xaiRouter.route('/agent-signal-monitor', agentSignalMonitor)

// Smart combined entry point
xaiRouter.post('/smart', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { intent = '' } = body

  if (intent.toLowerCase().includes('narrative') || intent.toLowerCase().includes('signal')) {
    return c.json({ route: '/xai/vertical-narrative-signal', tip: 'Best for vertical momentum & narrative analysis' })
  }
  if (intent.toLowerCase().includes('risk') || intent.toLowerCase().includes('wallet')) {
    return c.json({ route: '/xai/wallet-risk-scorer', tip: 'On-chain wallet risk scoring' })
  }

  return c.json({
    message: 'xAI Services active',
    available: [
      'vertical-narrative-signal',
      'wallet-risk-scorer',
      'niche-trend-pulse',
      'agent-signal-monitor'
    ],
    usage: 'POST to specific routes or use /xai/smart with intent'
  })
})

xaiRouter.get('/', (c) => c.json({
  message: 'xAI Services Router',
  services: 4,
  powered_by: 'xAI + x402'
}))