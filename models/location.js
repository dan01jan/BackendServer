// In your models/location.js
const mongoose = require('mongoose');

const locationSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    capacity: {
        type: Number,
        required: true
    }
});

exports.Location = mongoose.model('Location', locationSchema); // Correct export name
