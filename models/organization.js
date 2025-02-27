const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    department: {
        type: String,
        required: true
    },
    image: {
        type: String,
        default: ''
    },
    officers: [{
        name: {
            type: String,
            required: false
        },
        image: {
            type: String,
            default: ''
        },
        position: {
            type: String,
            required: false
        }
    }],
});

module.exports = mongoose.model('Organization', organizationSchema);
