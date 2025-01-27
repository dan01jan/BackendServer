const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { Type } = require('../models/type'); // Update the path to match where your model is located

// POST route to add an array of Event Types
router.post('/', async (req, res) => {
    const eventTypes = req.body.eventTypes; // Expecting an array of event type strings

    if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
        return res.status(400).json({ message: 'Please provide an array of event types' });
    }

    try {
        // Create an array of Type documents from the provided event types
        const newEventTypes = eventTypes.map(type => ({
            eventType: type
        }));

        // Insert all event types into the database
        await Type.insertMany(newEventTypes);

        res.status(201).json({ message: 'Event types added successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET route to retrieve all Event Types
router.get('/', async (req, res) => {
    try {
        // Fetch all event types from the database
        const eventTypes = await Type.find();

        // If no event types are found
        if (!eventTypes.length) {
            return res.status(404).json({ message: 'No event types found' });
        }

        res.status(200).json(eventTypes); // Return all event types
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
