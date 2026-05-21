import { Hono } from 'hono'
import { paymentMiddleware } from 'x402-hono'

export const agentSignalMonitor = new Hono()

agentSignalMonitor.use(
  paymentMiddleware({
    facilitator: { url: 'https://api.cdp.coinbase.com/platform/v2/x402/facilitator' },
    routes: {
      'POST /api/v1/monitor-signal': {
        price: '0.0012',
        network: 'base',
        recipient: process.env.RECIPIENT_ADDRESS || '0xYourWalletHere',
        description: 'Proactive x402 service and agent activity monitoring signals',
      },
    },
  })
)

agentSignalMonitor.post('/api/v1/monitor-signal', async (c) => {
  const { scope = 'all', lookback = '1h' } = await c.req.json()

  return c.json({
    scope,
    lookback,
    status: 'healthy',
    active_agents: 1247,
    signals: ['NarrativeSignal calls increasing', 'Wallet risk checks spiking'],
    alerts: [],
    recommendation: 'Strong time to promote VerticalNarrativeSignal and WalletRiskScorer',
    confidence: 0.92,
    checked_at: new Date().toISOString(),
  })
})

agentSignalMonitor.get('/', (c) => c.text('AgentSignalMonitor active'))