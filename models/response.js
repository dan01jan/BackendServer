const mongoose = require('mongoose');

const responseSchema = new mongoose.Schema({
    questionnaireId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Questionnaire',
        required: true,
    },
    questions: [{
        questionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Question',
            required: true,
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        }
    }],
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});
exports.Response = mongoose.model('Response', responseSchema);