import dotenv from 'dotenv'
import path from 'path'
// Explicitly load .env from the backend working directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { createServer } from 'http'
import app from './src/app.js'
import { initDb } from './src/config/db.js'
import { initSocket } from './src/realtime/socket.js'

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
    })
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err)
    process.exit(1)
  })

// Entry point for backend
