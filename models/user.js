const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    surname: {
        type: String,
        required: true,
    },
    email: { type: String, required: true, unique: true },
    passwordHash: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        default: '' 
    },
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true
    },
    department: {
        type: String,
        required: true
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
    isOfficer: {
        type: Boolean,
        default: false,
    },
    isHead: {
        type: Boolean,
        default: false,
    },
    declined: { type: Boolean, default: false },
    warningCount: {
        type: Number,
        default: 0
    },
    commentCooldown: {
        type: Date,
        default: null,
    },
     // New fields for OTP verification
    isVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpires: { type: Date },
      
});

userSchema.virtual('id').get(function () {
    return this._id.toHexString();
});

userSchema.set('toJSON', {
    virtuals: true,
});

exports.User = mongoose.model('User', userSchema);
