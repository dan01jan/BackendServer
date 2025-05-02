const mongoose = require('mongoose');

const questionSchema = mongoose.Schema({
    question: { 
        type: String, 
        required: true 
    },
    translated: { 
        type: String, 
        required: true 
    },
    scale: { 
        type: [Number], 
        required: true,
        default: [1, 2, 3, 4, 5] 
      },      
    traitId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Trait',
        required: true
    },
    typeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Type', // Reference to the Type model
            required: true
        },
    selectedQuestion: { 
        type: Boolean, 
        default: false 
    },
}); 

exports.Question = mongoose.model('Question', questionSchema);
