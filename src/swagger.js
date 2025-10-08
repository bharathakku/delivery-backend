const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'YourDelivery API',
    version: '0.1.0',
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },
  servers: [
    { url: '/api' },
    { url: 'http://localhost:4000/api' }
  ],
  paths: {
    '/healthz': {
      get: {
        summary: 'Health check',
        responses: { '200': { description: 'OK' } }
      }
    },
    '/orders/{id}/cancel': {
      post: {
        summary: 'Cancel order (customer)',
        security: [{ bearerAuth: [] }],
        parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string' } } ],
        requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { reason: { type: 'string' } } } } } },
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not Found' } }
      }
    },
    '/orders/{id}/rate': {
      post: {
        summary: 'Rate order (customer)',
        security: [{ bearerAuth: [] }],
        parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string' } } ],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { rating: { type: 'integer', minimum: 1, maximum: 5 }, review: { type: 'string' } }, required: ['rating'] } } } },
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not Found' } }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' }
                },
                required: ['email', 'password']
              }
            }
          }
        },
        responses: { '200': { description: 'OK' } }
      }
    },
    '/auth/signup': {
      post: {
        summary: 'Signup',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                  role: { type: 'string', enum: ['admin','customer','driver'] }
                },
                required: ['name','email','password','role']
              }
            }
          }
        },
        responses: { '200': { description: 'OK' } }
      }
    },
    '/vehicles': {
      get: { summary: 'List vehicles', responses: { '200': { description: 'OK' } } },
      post: {
        summary: 'Admin create vehicle type',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },
        responses: { '201': { description: 'Created' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' } }
      }
    },
    '/vehicles/db': {
      get: { summary: 'List DB vehicles', responses: { '200': { description: 'OK' } } }
    },
    
    '/drivers': {
      get: { summary: 'Admin list drivers', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' } } }
    },
    '/drivers/me': {
      get: { summary: 'Driver profile', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } } }
    },
    '/drivers/me/location': {
      patch: {
        summary: 'Driver update location',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } }, required: ['lat','lng'] } } } },
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } }
      }
    },
    '/orders/quote': {
      post: {
        summary: 'Quote order',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  vehicleId: { type: 'string', enum: ['two-wheeler','three-wheeler','heavy-truck'] },
                  distanceKm: { type: 'number', default: 5 }
                },
                required: ['vehicleId']
              }
            }
          }
        },
        responses: { '200': { description: 'OK' } }
      }
    },
    '/orders': {
      get: { summary: 'Admin list orders', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' } } },
      post: {
        summary: 'Create order',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { vehicleType: { type: 'string' }, from: { type: 'object' }, to: { type: 'object' }, distanceKm: { type: 'number' }, price: { type: 'number' } }, required: ['vehicleType','from','to'] } } }
        },
        responses: { '201': { description: 'Created' }, '401': { description: 'Unauthorized' } }
      }
    },
    '/orders/my-orders': {
      get: {
        summary: 'Get my orders (customer)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } }
      }
    },
    '/orders/{id}/tracking': {
      get: {
        summary: 'Get tracking info for order',
        security: [{ bearerAuth: [] }],
        parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string' } } ],
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not Found' } }
      }
    },
    '/orders/{id}/status': {
      patch: {
        summary: 'Update order status',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['assigned','accepted','picked_up','in_transit','delivered','cancelled'] } }, required: ['status'] } } } },
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } }
      }
    },
    '/orders/{id}/assign': {
      post: {
        summary: 'Manual assign driver',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { driverId: { type: 'string' } }, required: ['driverId'] } } } },
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' } }
      }
    },
    '/orders/{id}/auto-assign': {
      post: { 
        summary: 'Auto-assign nearest driver', 
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' } } 
      }
    },
    '/subscriptions': {
      get: { summary: 'List active plans', responses: { '200': { description: 'OK' } } },
      post: {
        summary: 'Admin create plan',
        security: [{ bearerAuth: [] }],
        requestBody: { 
          required: true, 
          content: { 
            'application/json': { 
              schema: { 
                type: 'object', 
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  price: { type: 'number' },
                  durationDays: { type: 'number' },
                  restrictions: {
                    type: 'object',
                    properties: {
                      maxActiveOrders: { type: 'number' },
                      prioritySupport: { type: 'boolean' }
                    }
                  }
                },
                required: ['name','price','durationDays']
              }
            } 
          } 
        },
        responses: { '201': { description: 'Created' }, '400': { description: 'Bad Request' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' } }
      }
    },
    '/subscriptions/{id}': {
      put: { 
        summary: 'Admin update plan', 
        security: [{ bearerAuth: [] }], 
        parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string' } } ],
        requestBody: { required: true, content: { 'application/json': { schema: { 
          type: 'object', 
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            durationDays: { type: 'number' },
            isActive: { type: 'boolean' },
            restrictions: { type: 'object', properties: { maxActiveOrders: { type: 'number' }, prioritySupport: { type: 'boolean' } } }
          }
        } } } }, 
        responses: { '200': { description: 'OK' }, '400': { description: 'Bad Request' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' }, '404': { description: 'Not Found' } } 
      },
      delete: { 
        summary: 'Admin delete plan', 
        security: [{ bearerAuth: [] }], 
        parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string' } } ],
        responses: { '200': { description: 'OK' }, '400': { description: 'Bad Request' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' } } 
      }
    },
    '/payments/cod': {
      post: { summary: 'Create COD payment', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { orderId: { type: 'string' }, amount: { type: 'number' } }, required: ['orderId','amount'] } } } }, responses: { '201': { description: 'Created' }, '401': { description: 'Unauthorized' } } }
    },
    '/payments/me': {
      get: { summary: 'My payments', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } } }
    },
    '/support': {
      get: { summary: 'Admin list tickets', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' } } },
      post: { summary: 'Create ticket', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { subject: { type: 'string' }, message: { type: 'string' } }, required: ['subject','message'] } } } }, responses: { '201': { description: 'Created' }, '401': { description: 'Unauthorized' } } }
    },
    '/support/{id}/messages': {
      post: { 
        summary: 'Add message to ticket', 
        security: [{ bearerAuth: [] }],
        parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string' } } ],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { body: { type: 'string' } }, required: ['body'] } } } }, 
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not Found' } } 
      }
    },
    '/notifications/me': {
      get: { summary: 'My notifications', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } } }
    },
    '/notifications': {
      post: { summary: 'Admin send notification', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '201': { description: 'Created' }, '401': { description: 'Unauthorized' }, '403': { description: 'Forbidden' } } }
    },
    '/notifications/{id}/read': {
      post: { 
        summary: 'Mark notification read', 
        security: [{ bearerAuth: [] }], 
        parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string' } } ],
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not Found' } } 
      }
    },
    '/addresses': {
      get: { summary: 'Get user addresses', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } } },
      post: { 
        summary: 'Add address', 
        security: [{ bearerAuth: [] }], 
        requestBody: { 
          required: true, 
          content: { 
            'application/json': { 
              schema: { 
                type: 'object', 
                properties: { 
                  type: { type: 'string' }, 
                  address: { type: 'string' }, 
                  isDefault: { type: 'boolean' } 
                }, 
                required: ['type','address'] 
              } 
            } 
          } 
        }, 
        responses: { '201': { description: 'Created' }, '401': { description: 'Unauthorized' } } 
      }
    },
    '/addresses/{id}': {
      put: { 
        summary: 'Update address', 
        security: [{ bearerAuth: [] }], 
        parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string' } } ],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { type: { type: 'string' }, address: { type: 'string' }, isDefault: { type: 'boolean' } } } } } }, 
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not Found' } } 
      },
      delete: { 
        summary: 'Delete address', 
        security: [{ bearerAuth: [] }], 
        parameters: [ { name: 'id', in: 'path', required: true, schema: { type: 'string' } } ],
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not Found' } } 
      }
    },
    
    '/users/me': {
      get: { summary: 'Get my user profile', security: [{ bearerAuth: [] }], responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not Found' } } },
      put: { summary: 'Update my user profile', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' } } } } } }, responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' }, '404': { description: 'Not Found' } } }
    },
  }
}

export default swaggerSpec


