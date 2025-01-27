const mongoose = require('mongoose');

const traitSchema = mongoose.Schema({
    trait: { 
        type: String, 
        required: true 
    },
}); 

exports.Trait = mongoose.model('Trait', traitSchema);
