import { Hono } from 'hono'
import { xaiRouter } from './xai'   // xAI Services (rebranded)

// Clean worker with xAI services mounted early
const app = new Hono<{ Bindings: { XAI_API_KEY?: string } }>()

// Mount xAI services BEFORE any wildcard middleware
app.route('/xai', xaiRouter)

// SKILL.md for agentic.market / Bazaar discovery
app.get('/SKILL.md', (c) => {
  return new Response('# xAI + x402 Services\n\nHigh-demand niche tools powered by xAI/Grok and x402 micropayments.', {
    headers: { 'Content-Type': 'text/markdown' }
  })
})

// Basic health
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'x402 Sandbox with xAI Services',
    xai_services: ['vertical-narrative-signal', 'wallet-risk-scorer', 'niche-trend-pulse', 'agent-signal-monitor'],
    routes: {
      xai: '/xai/*',
      skill: '/SKILL.md'
    },
    xai_key_detected: !!c.env.XAI_API_KEY
  })
})

export default app