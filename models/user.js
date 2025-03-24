const mongoose = require('mongoose');

const organizationMembershipSchema = new mongoose.Schema({
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  },
  role: {
    type: String,
    enum: ['User', 'Officer'],
    required: true,
  },
  department: {
    type: String,
    required: true,
  },
  isOfficer: {
    type: Boolean,
    default: false,
  },
});

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  surname: {
    type: String,
    required: true,
  },
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  passwordHash: {
    type: String,
    required: true,
  },
  // Remove the single organization fields and add the organizations array:
  organizations: {
    type: [organizationMembershipSchema],
    default: []
  },
  course: {
    type: String,
    default: ''
  },
  section: {
    type: String,
    default: ''
  },
  image: {
    type: String,
    default: ''
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  isHead: {
    type: Boolean,
    default: false,
  },
  declined: { 
    type: Boolean, 
    default: false 
  },
  warningCount: {
    type: Number,
    default: 0
  },
  commentCooldown: {
    type: Date,
    default: null,
  },
  isVerified: { type: Boolean, default: true },
  otp: { type: String },
  otpExpires: { type: Date },
});

userSchema.virtual('id').get(function () {
    return this._id.toHexString();
});

userSchema.virtual('isOfficer').get(function () {
    // Ensure organizations is an array; if not, default to an empty array.
    return (this.organizations || []).some(org =>
      (org.role || "").toLowerCase() === 'officer' && org.isOfficer === true
    );
  });

userSchema.set('toJSON', {
    virtuals: true,
});

exports.User = mongoose.model('User', userSchema);
