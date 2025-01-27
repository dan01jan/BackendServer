const mongoose = require('mongoose');

const ratingSchema = mongoose.Schema({
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    score: { 
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    feedback: {
        type: String,
        required: true
    },
    sentiment: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    }
});

exports.Rating = mongoose.model('Rating', ratingSchema);

