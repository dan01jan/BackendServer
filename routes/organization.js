const express = require('express');
const mongoose = require('mongoose');  // Import mongoose
const Organization = require('../models/organization');
const router = express.Router();

// Create Organization
router.post(`/`, async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name || !description) {
            return res.status(400).json({ message: "Name and description are required" });
        }

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
        const organizations = await Organization.find();
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
  
      console.log("Received request to fetch organization with ID:", id); // Log the received ID
  
      // Check if the provided ID is a valid MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
        console.error("Invalid Organization ID:", id); // Log invalid ID
        return res.status(400).json({ message: 'Invalid Organization ID' });
      }
  
      // Fetch the organization by its ID
      const organization = await Organization.findById(id);
  
      if (!organization) {
        console.error("Organization not found for ID:", id); // Log when organization is not found
        return res.status(404).json({ message: 'Organization not found' });
      }
  
      // Log specific details of the organization
      console.log("Organization Details:");
      console.log("Name:", organization.name); // Log the organization's name
      console.log("Description:", organization.description); // Log the organization's description
      console.log("Image:", organization.image); // Log the organization's image (if any)
      console.log("Other Details:", organization); // Log the entire organization object for all available details
  
      res.status(200).json(organization); // Send the organization data in the response
    } catch (error) {
      console.error('Error fetching organization:', error); // Log any unexpected errors
      res.status(500).json({ message: 'Error fetching organization', error: error.message });
    }
});

module.exports = router;
