import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Debug: Check if .env file exists
const envPath = path.resolve(process.cwd(), '.env')
console.log('Loading .env from:', envPath)
console.log('File exists:', fs.existsSync(envPath))

// Explicitly load .env from the backend working directory
dotenv.config({ path: envPath })

// Debug: Log all environment variables (be careful with sensitive data in production)
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID ? 'Set' : 'Missing',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET ? 'Set' : 'Missing',
  MONGO_URI: process.env.MONGO_URI ? 'Set' : 'Missing'
})

import { createServer } from 'http'
import app from './src/app.js'
import { initDb } from './src/config/db.js'
import { initSocket } from './src/realtime/socket.js'
import Driver from './src/models/Driver.js'

const port = process.env.PORT || 4000
const server = createServer(app)

// Initialize Socket.io
initSocket(server)

// Connect to MongoDB then start server
initDb()
  .then(() => {
    server.listen(port, () => {
      console.log(`API running on http://localhost:${port}`)
      console.log(`Swagger docs at http://localhost:${port}/api/docs`)
      // One-time diagnostic for Twilio env presence
      try {
        const haveSid = !!(process.env.TWILIO_SID || '').trim()
        const haveAuth = !!(process.env.TWILIO_AUTH_TOKEN || '').trim()
        const haveNumber = !!(process.env.TWILIO_PHONE_NUMBER || '').trim()
        const haveMsgSvc = !!(process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim()
        console.log('[Startup] Twilio env presence:', { haveSid, haveAuth, haveNumber, haveMessagingServiceSid: haveMsgSvc })
      } catch {}

      // Background presence sweeper: mark drivers offline if heartbeat stale (>60s)
      try {
        const OFFLINE_AFTER_MS = 60 * 1000
        setInterval(async () => {
          try {
            const cutoff = new Date(Date.now() - OFFLINE_AFTER_MS)
            const res = await Driver.updateMany(
              { isOnline: true, $or: [ { lastSeenAt: { $exists: false } }, { lastSeenAt: { $lte: cutoff } } ] },
              { $set: { isOnline: false } }
            )
            if (res?.modifiedCount) {
              console.log(`[Presence] Auto-offlined ${res.modifiedCount} stale drivers`)
            }
          } catch (e) { /* ignore sweep errors */ }
        }, 30 * 1000)
      } catch {}
    })
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err)
    process.exit(1)
  })

// Entry point for backend
