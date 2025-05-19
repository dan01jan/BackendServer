const mongoose = require('mongoose');

const commentSchema = mongoose.Schema({
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      default: ''
    },
    sentiment: {
        type: String,
        default: ''
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  });

const eventSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    type: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Type', 
        required: true
    },
    organization: {
        type: String,
        required: true,
    },
    secondOrganization: {
    type: String,
    required: false,
    },
    department: {
        type: String,
        required: true
    },
    dateStart: {
        type: Date,
        required: true
    },
    dateEnd: {
        type: Date,
        required: true
    },
    location: {
        type: mongoose.Schema.Types.Mixed,
        ref: 'Location',
        required: true
    },
    capacity: {
        type: Number,
        required: true
    },
    remainingCapacity: {
        type: Number,
        required: true
    },
    images: [{
        type: String
    }], 
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    hasQuestionnaire: { 
        type: Boolean, 
        default: false 
    },
    isArchived: {
    type: Boolean,
    default: false,
    },
    comments: [commentSchema]
});

exports.Event = mongoose.model('Event', eventSchema);