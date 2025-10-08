import mongoose from 'mongoose'

const MessageSchema = new mongoose.Schema({
  threadId: { type: String, index: true, required: true },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, index: true },
  text: { type: String, trim: true },
  attachments: [{
    url: String,
    name: String,
    type: String,
    size: Number,
  }],
  readAt: { type: Date, default: null },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })

MessageSchema.index({ threadId: 1, createdAt: -1 })

export default mongoose.model('Message', MessageSchema)
