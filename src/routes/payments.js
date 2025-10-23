import { Router } from 'express'
import Payment from '../models/Payment.js'
import mongoose from 'mongoose'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import Joi from 'joi'
import crypto from 'crypto'
import Driver from '../models/Driver.js'

const router = Router()

// ----------------- Razorpay Configuration -----------------
// This function ensures we get fresh environment variables when needed
function getRazorpayConfig() {
  const RZ_KEY_ID = (process.env.RAZORPAY_KEY_ID || '').trim()
  const RZ_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || '').trim()
  const HAS_RZ = !!(RZ_KEY_ID && RZ_KEY_SECRET)
  
  // Log the current config status
  console.log('Razorpay Config Status:', {
    keyId: RZ_KEY_ID ? 'Configured' : 'Missing',
    keySecret: RZ_KEY_SECRET ? 'Configured' : 'Missing',
    isConfigured: HAS_RZ
  })
  
  return { RZ_KEY_ID, RZ_KEY_SECRET, HAS_RZ }
}

// Server-side plan catalogue to avoid trusting client for price/duration
const SERVER_PLANS = {
  'daily': { id: 'daily', name: 'Daily Plan', price: 49, durationDays: 1 },
  'weekly': { id: 'weekly', name: 'Weekly Plan', price: 399, durationDays: 7 },
  'monthly': { id: 'monthly', name: 'Monthly Plan', price: 1399, durationDays: 30 }
}

// Validation schemas
const processSchema = Joi.object({
  orderId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  amount: Joi.number().positive().required(),
  method: Joi.string().valid('upi', 'card', 'cod', 'stripe').required(),
})

const codSchema = Joi.object({
  orderId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  amount: Joi.number().positive().required(),
})

// Available payment methods (mock)
router.get('/methods', requireAuth, async (_req, res) => {
  res.json([
    { id: 'upi', label: 'UPI' },
    { id: 'card', label: 'Credit/Debit Card' },
    { id: 'cod', label: 'Cash on Delivery' },
  ])
})

// Generic payment processing (mock)
router.post('/process', requireAuth, validate(processSchema), async (req, res) => {
  try {
    const { orderId, amount, method } = req.body || {}
    const rec = await Payment.create({ orderId, userId: req.user.id, method: method === 'card' ? 'stripe' : method, amount, status: method === 'cod' ? 'pending' : 'paid' })
    res.status(201).json({ ok: true, payment: rec })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Payment processing failed' })
  }
})

// Create COD payment record (mock)
router.post('/cod', requireAuth, validate(codSchema), async (req, res) => {
  try {
    const { orderId, amount } = req.body || {}
    const rec = await Payment.create({ orderId, userId: req.user.id, method: 'cod', amount, status: 'pending' })
    res.status(201).json(rec)
  } catch (err) {
    console.error(err)
    if (err?.name === 'ValidationError') return res.status(400).json({ error: err.message })
    res.status(500).json({ error: 'Failed to create payment' })
  }
})

// List my payments
router.get('/me', requireAuth, async (req, res) => {
  const items = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100)
  res.json(items)
})

// Alias used by some frontends
router.get('/transactions', requireAuth, async (req, res) => {
  const items = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100)
  res.json(items)
})

const createOrderSchema = Joi.object({
  planId: Joi.string().valid('daily','weekly','monthly').required(),
})

router.post('/razorpay/order', requireAuth, validate(createOrderSchema), async (req, res) => {
  try {
    console.log('Received order request:', { 
      body: req.body, 
      user: { 
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role
      },
      headers: {
        ...req.headers,
        authorization: req.headers.authorization ? '***REDACTED***' : 'Not provided'
      }
    });
    
    const { RZ_KEY_ID, RZ_KEY_SECRET, HAS_RZ } = getRazorpayConfig()
    const isTestMode = RZ_KEY_ID && RZ_KEY_ID.startsWith('rzp_test_');
    
    console.log('Razorpay Mode:', isTestMode ? 'TEST MODE' : 'LIVE MODE');
    
    // Log environment status (without sensitive data)
    console.log('Razorpay Config Check:', {
      hasKeyId: !!RZ_KEY_ID,
      hasKeySecret: !!RZ_KEY_SECRET,
      isConfigured: HAS_RZ,
      isTestMode,
      env: process.env.NODE_ENV,
      nodeVersion: process.version
    });
    
    if (!HAS_RZ) {
      const errorMsg = 'Razorpay not properly configured. Please check server logs.';
      console.error(errorMsg, {
        RAZORPAY_KEY_ID: RZ_KEY_ID ? 'Set' : 'Missing',
        RAZORPAY_KEY_SECRET: RZ_KEY_SECRET ? 'Set' : 'Missing',
        env: process.env.NODE_ENV
      });
      return res.status(500).json({ 
        error: errorMsg,
        details: 'Check server configuration. Make sure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set.'
      });
    }
    const { planId } = req.body
    const plan = SERVER_PLANS[planId]
    if (!plan) return res.status(400).json({ error: 'Invalid plan' })

    // Compute activation base: extend if existing active subscription
    const driver = await Driver.findOne({ userId: req.user.id })
    const now = new Date()
    const activationDate = (driver?.subscriptionExpiry && new Date(driver.subscriptionExpiry) > now)
      ? new Date(driver.subscriptionExpiry) : now
    const expiryDate = new Date(activationDate)
    expiryDate.setDate(expiryDate.getDate() + plan.durationDays)

    // Ensure the price is a valid number and convert to paise
    const amountPaise = Math.round(Number(plan.price) * 100)
    if (isNaN(amountPaise) || amountPaise <= 0) {
      throw new Error(`Invalid price for plan ${planId}: ${plan.price}`)
    }
    
    console.log(`Processing payment: ${plan.name} - ${plan.price} INR (${amountPaise} paise)`)
    
    // Generate a shorter receipt ID that's under 40 characters
    const timestamp = Date.now().toString().slice(-6) // Last 6 digits of timestamp
    const userId = req.user.id.toString().slice(-6) // Last 6 digits of user ID
    const receipt = `sub_${plan.id.slice(0,3)}_${timestamp}_${userId}` // e.g., 'sub_wee_123456_789012'

    let order;
    // Create Razorpay order via REST
    try {
      console.log('Creating Razorpay order with amount:', amountPaise, 'receipt:', receipt)
      const authHeader = 'Basic ' + Buffer.from(`${RZ_KEY_ID}:${RZ_KEY_SECRET}`).toString('base64')
      const requestBody = { 
        amount: amountPaise, 
        currency: 'INR', 
        receipt: receipt,
        payment_capture: 1
      };
      
      const requestOptions = {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': authHeader,
          'User-Agent': 'YourDelivery/1.0'
        },
        body: JSON.stringify(requestBody)
      };
      
      console.log('Sending request to Razorpay API:', {
        url: 'https://api.razorpay.com/v1/orders',
        method: requestOptions.method,
        headers: {
          ...requestOptions.headers,
          'Authorization': 'Basic ***REDACTED***' // Don't log actual credentials
        },
        body: requestBody
      });
      
      let response;
      try {
        response = await fetch('https://api.razorpay.com/v1/orders', requestOptions);
        order = await response.json();
      } catch (fetchError) {
        console.error('Failed to parse Razorpay response:', fetchError);
        throw new Error(`Failed to process Razorpay response: ${fetchError.message}`);
      }
      
      if (!response.ok) {
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          error: order,
          requestBody: requestBody,
          headers: Object.fromEntries(response.headers.entries())
        };
        
        console.error('Razorpay API Error:', errorDetails);
        
        // Return more detailed error information
        return res.status(500).json({ 
          error: 'Failed to create payment order',
          details: order.error?.description || 'Unknown error from Razorpay',
          status: response.status,
          code: order.error?.code,
          field: order.error?.field
        });
      }
      
      console.log('Razorpay order created:', { 
        orderId: order.id, 
        amount: order.amount,
        currency: order.currency || 'INR',
        receipt: order.receipt,
        status: order.status || 'created'
      });

      // Return order details to frontend in the expected format
      const responseData = {
        data: {
          order: {
            id: order.id,
            entity: order.entity,
            amount: order.amount,
            amount_paid: order.amount_paid || 0,
            amount_due: order.amount_due || order.amount,
            currency: order.currency || 'INR',
            receipt: order.receipt,
            status: order.status || 'created',
            attempts: order.attempts || 0,
            created_at: order.created_at || Date.now(),
            // Add any additional fields that might be needed
            notes: {
              planId: plan.id,
              planName: plan.name,
              durationDays: plan.durationDays
            }
          },
          keyId: RZ_KEY_ID
        }
      };
      
      console.log('Sending response to client:', JSON.stringify(responseData, null, 2));
      res.json(responseData);
      
    } catch (error) {
      console.error('Error creating Razorpay order:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
        config: error.config
      })
      return res.status(500).json({ 
        error: 'Error connecting to payment gateway',
        details: error.message
      })
    }
  } catch (e) {
    console.error('Error in payment initialization:', e)
    res.status(500).json({ 
      error: 'Failed to initialize payment',
      details: e.message 
    })
  }
})

// Verify payment signature and activate subscription
const verifySchema = Joi.object({
  razorpay_order_id: Joi.string().required(),
  razorpay_payment_id: Joi.string().required(),
  razorpay_signature: Joi.string().required(),
  planId: Joi.string().valid('daily','weekly','monthly').required(),
})

router.post('/razorpay/verify', requireAuth, validate(verifySchema), async (req, res) => {
  try {
    const { RZ_KEY_ID, RZ_KEY_SECRET, HAS_RZ } = getRazorpayConfig();
    if (!HAS_RZ) return res.status(400).json({ error: 'Razorpay not configured' });
    
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body;
    const isTestMode = RZ_KEY_ID && RZ_KEY_ID.startsWith('rzp_test_');
    
    console.log('Verifying payment:', { 
      order_id: razorpay_order_id, 
      payment_id: razorpay_payment_id,
      isTestMode,
      planId
    });
    
    // In test mode, we'll skip signature verification for testing purposes
    if (!isTestMode) {
      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', RZ_KEY_SECRET);
      hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
      const generatedSignature = hmac.digest('hex');
      
      if (generatedSignature !== razorpay_signature) {
        console.error('Invalid signature:', { generatedSignature, receivedSignature: razorpay_signature });
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid payment signature',
          details: 'Payment verification failed. The payment signature does not match.'
        });
      }
    } else {
      console.log('Skipping signature verification in test mode');
    }
    
    // Get the plan details
    const plan = SERVER_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }
    
    // Find the driver
    const driver = await Driver.findOne({ userId: req.user.id });
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }
    
    // Calculate subscription dates
    const now = new Date();
    const base = (driver.subscriptionExpiry && new Date(driver.subscriptionExpiry) > now) 
      ? new Date(driver.subscriptionExpiry) 
      : now;
      
    const newExpiry = new Date(base);
    newExpiry.setDate(newExpiry.getDate() + (plan.durationDays || 30));
    
    // Update driver's subscription
    driver.subscriptionPlan = plan.id;
    driver.subscriptionExpiry = newExpiry;
    
    // Store subscription details
    driver.subscription = {
      planId: plan.id,
      planName: plan.name,
      amount: plan.price,
      currency: 'INR',
      startDate: base,
      expiryDate: newExpiry,
      status: 'active',
      payment: {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        amount: plan.price,
        currency: 'INR',
        status: 'captured',
        method: 'razorpay',
        testMode: isTestMode,
        verifiedAt: new Date()
      }
    };
    
    await driver.save();
    
    // Record the payment
    await Payment.create({
      // Store Razorpay order ID as a string in orderId
      orderId: razorpay_order_id,
      userId: req.user.id,
      method: 'razorpay',
      amount: plan.price,
      currency: 'INR',
      status: 'paid',
      providerPaymentId: razorpay_payment_id,
      meta: {
        planId: plan.id,
        planName: plan.name,
        durationDays: plan.durationDays || (plan.id === 'daily' ? 1 : plan.id === 'weekly' ? 7 : 30),
        isTestMode: isTestMode,
        verifiedAt: new Date().toISOString()
      }
    });
    
    console.log('Subscription activated:', {
      userId: req.user.id,
      planId: plan.id,
      expiryDate: newExpiry,
      isTestMode
    });
    
    // Return success response
    return res.json({
      success: true,
      message: 'Payment verified and subscription activated',
      subscription: {
        planId: plan.id,
        planName: plan.name,
        startDate: base,
        expiryDate: newExpiry,
        status: 'active',
        isTestMode
      }
    });
  } catch (error) {
    console.error('Error in payment verification:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process payment verification',
      details: error.message
    });
  }
});

// Export the router
export default router;
