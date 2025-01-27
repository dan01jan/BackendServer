const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    dateRegistered: {
        type: Date,
        default: Date.now
    },
    hasAttended: {
        type: Boolean,
        default: false
    },
});

attendanceSchema.virtual('id').get(function () {
    return this._id.toHexString();
});

attendanceSchema.set('toJSON', {
    virtuals: true,
});

exports.Attendance = mongoose.model('Attendance', attendanceSchema);
