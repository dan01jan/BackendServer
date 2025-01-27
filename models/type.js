// In your models/type.js (Make sure this is correct)
const mongoose = require('mongoose');

const typeSchema = mongoose.Schema({
    eventType: { 
        type: String, 
        required: true 
    },
}); 

exports.Type = mongoose.model('Type', typeSchema);  // Correct export name
