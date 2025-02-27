const express = require('express');
const Organization = require('../models/organization'); // Corrected import
const router = express.Router();

// Create Organization
router.post(`/`, async (req, res) => {
    try {
        // Extract data from request body
        const { name, description } = req.body;

        // Validate required fields
        if (!name || !description) {
            return res.status(400).json({ message: "Name and description are required" });
        }

        // Create and save organization
        const organization = new Organization({
            name,
            description,
        });

        const savedOrganization = await organization.save();
        res.status(201).json(savedOrganization);

    } catch (error) {
        console.error('Error creating organization:', error);
        res.status(500).json({ message: 'Error creating organization', error: error.message });
    }
});

// Get All Organizations
router.get('/', async (req, res) => {
    try {
        // Fetch all organizations from the database
        const organizations = await Organization.find();

        // Return the list of organizations
        res.status(200).json(organizations);
    } catch (error) {
        console.error('Error fetching organizations:', error);
        res.status(500).json({ message: 'Error fetching organizations', error: error.message });
    }
});

// Get Organization by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid Organization ID' });
        }

        // Find the organization by ID
        const organization = await Organization.findById(id);

        if (!organization) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        res.status(200).json(organization);
    } catch (error) {
        console.error('Error fetching organization:', error);
        res.status(500).json({ message: 'Error fetching organization', error: error.message });
    }
});


module.exports = router;
