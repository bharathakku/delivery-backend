import { Server } from 'socket.io';
import Driver from '../models/Driver.js';

// Helper function to check if a driver is online
async function isDriverOnline(driverId) {
  try {
    const driver = await Driver.findById(driverId).select('lastSeen isOnline').lean();
    if (!driver) return false;
    
    // Consider driver online if seen in the last 2 minutes
    if (driver.isOnline === false) return false;
    if (!driver.lastSeen) return false;
    
    const lastSeen = new Date(driver.lastSeen).getTime();
    const now = Date.now();
    return (now - lastSeen) < (2 * 60 * 1000); // 2 minutes
  } catch (error) {
    console.error('Error checking driver online status:', error);
    return false;
  }
}

// Store active admin connections
const adminRooms = new Map();

// Store driver locations
const driverLocations = new Map();

// Export the ioInstance variable
export let ioInstance = null;

export function initSocket(server) {
  // Create HTTP server if not provided
  if (!server) {
    throw new Error('HTTP server is required for Socket.IO');
  }

  console.log('Initializing Socket.IO server...');

  // Configure CORS to be more permissive for development
  const corsOptions = {
    origin: function(origin, callback) {
      console.log('Origin connecting:', origin);
      // Allow all origins in development
      callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  };

  // Initialize Socket.IO with explicit configuration
  ioInstance = new Server(server, {
    // CORS configuration
    cors: corsOptions,
    
    // Path configuration
    path: '/socket.io',
    
    // Transport configuration
    transports: ['websocket', 'polling'], // Try both WebSocket and polling
    allowEIO3: true, // Enable compatibility with Socket.IO v2 clients
    
    // Timeout and ping settings
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 10000,
    
    // Other settings
    cookie: false,
    serveClient: false,
    
    // Enable debugging
    allowRequest: (req, callback) => {
      console.log('Socket.IO connection request:', {
        url: req.url,
        headers: req.headers,
        query: req._query
      });
      callback(null, true); // authorize all requests
    }
  });

  // Log when namespaces are created
  console.log('Socket.IO server initialized with namespaces:', Array.from(ioInstance._nsps.keys()));
  
  // Add connection logging middleware
  ioInstance.use((socket, next) => {
    const clientId = socket.id;
    const { query = {}, headers = {} } = socket.handshake;
    
    console.log('New connection attempt:', {
      clientId,
      query,
      headers: {
        'user-agent': headers['user-agent'],
        'origin': headers['origin'],
        'x-forwarded-for': headers['x-forwarded-for']
      },
      url: socket.handshake.url,
      time: new Date().toISOString()
    });
    
    // Log the connection attempt to the default namespace
    console.log(`Client ${clientId} connecting to namespace:`, socket.nsp.name);
    
    // Continue with the connection
    next();
  });
  
  // Handle connection errors
  ioInstance.on('connect_error', (error) => {
    console.error('Socket.IO connection error:', error);
  });
  
  // Handle successful connections to the root namespace
  ioInstance.of('/').on('connection', (socket) => {
    console.log(`Client connected to root namespace: ${socket.id}`);
    
    socket.on('error', (error) => {
      console.error(`Socket error from ${socket.id}:`, error);
    });
    
    socket.on('disconnect', (reason) => {
      console.log(`Client ${socket.id} disconnected:`, reason);
    });
  });

  ioInstance.on('connection', (socket) => {
    console.log('New client connected:', socket.id, 'with query:', socket.handshake.query);
    
    // Handle driver connections
    socket.on('driver:register', async (driverId) => {
      if (!driverId) return;
      
      try {
        // Add driver to the room for their ID
        await socket.join(`driver:${driverId}`);
        console.log(`Driver ${driverId} connected`);
        
        // Update driver's online status
        await Driver.findByIdAndUpdate(driverId, { isOnline: true, lastSeen: new Date() });
        
        // Notify admins that driver is online
        ioInstance.emit('driver:status', { 
          driverId, 
          isOnline: true,
          lastSeen: new Date()
        });
        
        // If we have a previous location, send it to the driver
        if (driverLocations.has(driverId)) {
          socket.emit('location:update', driverLocations.get(driverId));
        }
      } catch (error) {
        console.error('Error in driver:register:', error);
      }
    });
    
    // Handle driver location updates
    socket.on('location:update', async (data) => {
      const { driverId, lat, lng, address, heading, speed } = data || {};
      if (!driverId || lat === undefined || lng === undefined) {
        console.error('Invalid location update data:', data);
        return;
      }
      
      try {
        const locationData = {
          driverId,
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          address: address || 'Location not available',
          heading: heading ? parseFloat(heading) : null,
          speed: speed ? parseFloat(speed) : null,
          timestamp: new Date()
        };
        
        console.log(`Location update received for driver ${driverId}:`, locationData);
        
        // Store the latest location
        driverLocations.set(driverId, locationData);
        
        // Update driver's last known location in the database
        await Driver.findByIdAndUpdate(driverId, {
          'currentLocation.coordinates': [lng, lat],
          'currentLocation.address': locationData.address,
          'currentLocation.heading': locationData.heading,
          'currentLocation.speed': locationData.speed,
          lastSeen: new Date(),
          isOnline: true
        }, { new: true });
        
        // Broadcast to all admins who are tracking this driver
        ioInstance.to(`admin:tracking:${driverId}`).emit('driver:location', locationData);
        
        console.log(`Location updated for driver ${driverId}:`, { lat, lng, address });
      } catch (error) {
        console.error('Error in location:update:', error);
      }
    });
    
    // Handle admin connections for tracking specific drivers
    socket.on('admin:track', async (data) => {
      const driverId = data?.driverId || data;
      if (!driverId) {
        console.error('No driverId provided for admin:track');
        return;
      }
      
      try {
        // Join the room for this driver
        await socket.join(`admin:tracking:${driverId}`);
        adminRooms.set(socket.id, `admin:tracking:${driverId}`);
        
        console.log(`Admin ${socket.id} is now tracking driver ${driverId}`);
        
        // Send the latest known location if available
        if (driverLocations.has(driverId)) {
          const location = driverLocations.get(driverId);
          console.log(`Sending last known location to admin for driver ${driverId}:`, location);
          socket.emit('driver:location', location);
        } else {
          // If no recent location, try to get it from the database
          const driver = await Driver.findById(driverId).select('currentLocation isOnline lastSeen').lean();
          if (driver?.currentLocation?.coordinates) {
            const [lng, lat] = driver.currentLocation.coordinates;
            const locationData = {
              driverId,
              lat,
              lng,
              address: driver.currentLocation.address || 'Location not available',
              heading: driver.currentLocation.heading || null,
              speed: driver.currentLocation.speed || null,
              timestamp: driver.lastSeen || new Date()
            };
            console.log(`Sending database location to admin for driver ${driverId}:`, locationData);
            socket.emit('driver:location', locationData);
          }
        }
        
        // Send current status
        socket.emit('driver:status', {
          driverId,
          isOnline: await isDriverOnline(driverId),
          lastSeen: (await Driver.findById(driverId).select('lastSeen').lean())?.lastSeen
        });
      } catch (error) {
        console.error('Error in admin:track:', error);
      }
    });
    
    // Handle client disconnection
    socket.on('disconnect', async () => {
      console.log('Client disconnected:', socket.id);
      
      // Check if this was an admin connection
      const adminRoom = adminRooms.get(socket.id);
      if (adminRoom) {
        adminRooms.delete(socket.id);
        console.log(`Admin ${socket.id} stopped tracking`);
      }
      
      // Check if this was a driver connection
      const driverId = [...socket.rooms].find(room => room.startsWith('driver:'))?.replace('driver:', '');
      if (driverId) {
        try {
          // Update driver's online status
          await Driver.findByIdAndUpdate(driverId, { 
            isOnline: false,
            lastSeen: new Date()
          });
          
          // Notify admins that driver is offline
          ioInstance.emit('driver:status', { 
            driverId, 
            isOnline: false,
            lastSeen: new Date()
          });
          
          console.log(`Driver ${driverId} disconnected`);
        } catch (error) {
          console.error('Error updating driver status on disconnect:', error);
        }
      }
    });
    
    // Existing code for order and chat functionality
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


