import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const API = 'https://dlmm.datapi.meteora.ag'
const cache = new Map()
async function cached(key, url, ttl = 60000) {
  const c = cache.get(key)
  if (c && Date.now() - c.t < ttl) return c.v
  const r = await fetch(url, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error('upstream ' + r.status)
  const v = await r.json()
  cache.set(key, { t: Date.now(), v })
  return v
}
const slim = (p) => ({
  address: p.address, name: p.name,
  x: { symbol: p.token_x.symbol, address: p.token_x.address, price: p.token_x.price, verified: p.token_x.is_verified },
  y: { symbol: p.token_y.symbol, address: p.token_y.address, price: p.token_y.price, verified: p.token_y.is_verified },
  binStep: p.pool_config?.bin_step, baseFee: p.pool_config?.base_fee_pct, dynamicFee: p.dynamic_fee_pct,
  tvl: p.tvl, price: p.current_price, apr: p.apr, apy: p.apy, farmApr: p.farm_apr,
  volume: p.volume, fees: p.fees, amountX: p.token_x_amount, amountY: p.token_y_amount,
  createdAt: p.created_at, cumulative: p.cumulative_metrics,
})
app.get('/api/pools', async (req, res) => {
  try {
    const d = await cached('pools', `${API}/pools?page_size=200`)
    const pools = d.data.filter((p) => !p.is_blacklisted).map(slim)
    const stats = {
      totalPools: d.total,
      tvl: pools.reduce((a, p) => a + (p.tvl || 0), 0),
      volume24h: pools.reduce((a, p) => a + (p.volume?.['24h'] || 0), 0),
      fees24h: pools.reduce((a, p) => a + (p.fees?.['24h'] || 0), 0),
    }
    res.set('cache-control', 'public, max-age=30').json({ updatedAt: Date.now(), stats, pools })
  } catch (e) { res.status(502).json({ error: String(e.message) }) }
})
app.get('/api/pools/:addr', async (req, res) => {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(req.params.addr)) return res.status(400).json({ error: 'bad address' })
  try { res.json(slim(await cached('p:' + req.params.addr, `${API}/pools/${req.params.addr}`))) }
  catch (e) { res.status(502).json({ error: String(e.message) }) }
})
const dist = path.join(__dirname, 'dist')
app.use(express.static(dist, { maxAge: '1h', index: false }))
app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')))
const port = process.env.PORT || 3000
app.listen(port, () => console.log('Kagura listening on ' + port))
