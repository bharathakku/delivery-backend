import mongoose from 'mongoose'

const MessageSchema = new mongoose.Schema(
  {
    fromRole: { type: String, enum: ['admin', 'customer', 'partner', 'driver'], required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    body: { type: String, required: true },
    readByAdmin: { type: Boolean, default: false },
    readByUser: { type: Boolean, default: false },
  },
  { timestamps: true }
)

const SupportTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true },
    description: { type: String },
    category: { type: String, enum: ['payment', 'documents', 'technical', 'training', 'vehicle', 'other'], default: 'other' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },
    messages: [MessageSchema],
  },
  { timestamps: true }
)

export default mongoose.model('SupportTicket', SupportTicketSchema)





