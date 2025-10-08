import mongoose from 'mongoose'

const VerificationTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    type: { type: String, enum: ['email', 'password_reset', 'phone'], required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
    // Optional fields for phone OTP
    phone: { type: String },
    code: { type: String },
  },
  { timestamps: true }
)

export default mongoose.model('VerificationToken', VerificationTokenSchema)


