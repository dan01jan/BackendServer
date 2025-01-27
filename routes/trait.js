const { Trait } = require('../models/trait');
const express = require('express');
const router = express.Router();


//Fetch all Traits
router.get('/', async (req, res) => {
    try {
        const traitList = await Trait.find();
        
        if (traitList.length === 0) {
            return res.status(200).json([]);
        }

        res.status(200).json(traitList);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching traits", error: error.message });
    }
});

//Create Trait
router.post('/create-trait', async (req, res) => {
    const { trait } = req.body;

    if (!trait) {
        return res.status(400).json({ message: 'Trait name is required' });
    }

    try {
        const newTrait = new Trait({ trait });
        await newTrait.save();

        res.status(201).json({ message: 'Trait created successfully', trait: newTrait });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating trait', error: error.message });
    }
});

// Edit Trait
router.put('/edit-trait/:id', async (req, res) => {
    const { id } = req.params;
    const { trait } = req.body;
  
    try {
      const updatedTrait = await Trait.findByIdAndUpdate(
        id,
        { trait },
        { new: true }
      );
  
      if (!updatedTrait) {
        return res.status(404).json({ message: 'Trait not found' });
      }
  
      res.status(200).json(updatedTrait);
    } catch (error) {
      res.status(500).json({ message: 'Error updating trait', error });
    }
  });

// Delete Trait
router.delete('/delete-trait/:id', async (req, res) => {
    const { id } = req.params;
  
    try {
      const deletedTrait = await Trait.findByIdAndDelete(id);
  
      if (!deletedTrait) {
        return res.status(404).json({ message: 'Trait not found' });
      }
  
      res.status(200).json({ message: 'Trait deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting trait', error });
    }
  });
  
  
module.exports = router;
