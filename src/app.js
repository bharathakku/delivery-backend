import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import vehiclesRouter from './routes/vehicles.js'
import ordersRouter from './routes/orders.js'
import authRouter from './routes/auth.js'
import usersRouter from './routes/users.js'
import driversRouter from './routes/drivers.js'
import swaggerUi from 'swagger-ui-express'
import swaggerSpec from './swagger.js'
import subscriptionsRouter from './routes/subscriptions.js'
import paymentsRouter from './routes/payments.js'
import supportRouter from './routes/support.js'
import notificationsRouter from './routes/notifications.js'
import chatRouter from './routes/chat.js'
import addressesRouter from './routes/addresses.js'
import zonesRouter from './routes/zones.js'
import pricingRouter from './routes/pricing.js'
import analyticsRouter from './routes/analytics.js'
import path from 'path'

const app = express()

// Serve uploads BEFORE global CORS so assets are publicly accessible across ports
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  // Allow any origin to fetch static assets (safe for images)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')))

app.use(helmet())
app.use(express.json())
app.use(morgan('dev'))
// Restrictive CORS: allow only specified origins (comma-separated in ALLOWED_ORIGINS)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
app.use(cors({
  origin: (origin, cb) => {
    // Allow non-browser requests (like curl or server-to-server without Origin)
    if (!origin) return cb(null, true)
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true)
    return cb(new Error('CORS not allowed from this origin'))
  },
  credentials: true,
}))

// (uploads static already configured above)

// Health endpoint under API namespace to match Swagger server base
app.get('/api/healthz', (req, res) => res.json({ ok: true }))

// API namespace
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/vehicles', vehiclesRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/drivers', driversRouter)
app.use('/api/subscriptions', subscriptionsRouter)
app.use('/api/payments', paymentsRouter)
// Alias singular path expected by some frontends
app.use('/api/payment', paymentsRouter)
app.use('/api/support', supportRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/addresses', addressesRouter)
app.use('/api/zones', zonesRouter)
app.use('/api/pricing', pricingRouter)
app.use('/api/analytics', analyticsRouter)

// Swagger docs (disable CSP for compatibility with browser AV extensions)
app.use('/api/docs', helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

export default app


