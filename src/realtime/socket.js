import { Server } from 'socket.io'

let ioInstance = null

export function initSocket(server) {
  ioInstance = new Server(server, {
    cors: { origin: true, credentials: true }
  })

  ioInstance.on('connection', (socket) => {
    // Client joins rooms for tracking
    socket.on('join-order', (orderId) => {
      socket.join(`order:${orderId}`)
    })
    socket.on('leave-order', (orderId) => {
      socket.leave(`order:${orderId}`)
    })

    // Driver client can join its personal room to receive assignment updates
    socket.on('join-driver', (driverId) => {
      if (!driverId) return
      socket.join(`driver:${driverId}`)
    })
    socket.on('leave-driver', (driverId) => {
      if (!driverId) return
      socket.leave(`driver:${driverId}`)
    })

    // Driver location updates broadcast to order room
    socket.on('driver-location', (data) => {
      const { orderId, lat, lng, heading, speed } = data || {}
      if (!orderId) return
      ioInstance.to(`order:${orderId}`).emit('driver-location', { orderId, lat, lng, heading, speed, ts: Date.now() })
    })

    // Chat: join/leave thread rooms
    socket.on('chat:join', (threadId) => {
      if (!threadId) return
      try { console.log('[Socket] chat:join', { socketId: socket.id, threadId }) } catch {}
      socket.join(`thread:${threadId}`)
    })
    socket.on('chat:leave', (threadId) => {
      if (!threadId) return
      try { console.log('[Socket] chat:leave', { socketId: socket.id, threadId }) } catch {}
      socket.leave(`thread:${threadId}`)
    })
    // Chat message relay (persistence handled via REST; this simply rebroadcasts if needed)
    socket.on('chat:message', (payload) => {
      const { threadId, message } = payload || {}
      if (!threadId || !message) return
      try { console.log('[Socket] chat:message relay', { threadId, messageId: message?._id }) } catch {}
      ioInstance.to(`thread:${threadId}`).emit('chat:message', message)
    })
    socket.on('chat:read', (payload) => {
      const { threadId, at } = payload || {}
      if (!threadId) return
      try { console.log('[Socket] chat:read', { threadId, at }) } catch {}
      ioInstance.to(`thread:${threadId}`).emit('chat:read', { threadId, at: at || Date.now() })
    })
  })

  console.log('Socket.io initialized')
  return ioInstance
}

export function io() {
  if (!ioInstance) throw new Error('Socket.io not initialized')
  return ioInstance
}


