const express = require('express');
const mongoose = require('mongoose');  // Import mongoose
const Organization = require('../models/organization');
const cloudinary = require('../utils/cloudinary');
const uploadOptions = require('../utils/multer');
const streamifier = require('streamifier');
const router = express.Router();

// Department Mapping Function
const getDepartment = (selectedOrganization) => {
    switch (selectedOrganization) {
      case "ACES":
      case "GreeCS":
        return "CAAD";
      case "TEST":
        return "BASD";
      case "BSEEG":
      case "IECEP":
      case "ICS":
      case "MTICS":
      case "MRSP":
        return "EAAD";
      case "ASE":
      case "DMMS":
      case "EleMechS":
      case "JPSME":
      case "JSHRAE":
      case "METALS":
      case "TSNT":
        return "MAAD";
      default:
        return "";
    }
  };

// Create Organization Route with Image Upload
router.post('/', uploadOptions.single('image'), async (req, res) => {
    try {
        const { name, description, officers } = req.body;

        if (!name || !description) {
          return res.status(400).json({ message: "Name and description are required" });
        }
        
        // Determine department based on the organization name
        const department = getDepartment(name);
        
        if (!department) {
          return res.status(400).json({ message: "Invalid organization name. Cannot determine department." });
        }        
  
      // Upload image to Cloudinary
      let imageUrl = "";
      if (req.file) {
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { resource_type: 'image' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result.secure_url);
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });
  
        imageUrl = result; // Cloudinary Image URL
      }
  
      // Create new organization
      const organization = new Organization({
        name,
        description,
        department,
        image: imageUrl,
        officers
      });
  
      const savedOrganization = await organization.save();
      res.status(201).json(savedOrganization);
    } catch (error) {
      console.error('Error creating organization:', error);
      res.status(500).json({ message: 'Error creating organization', error: error.message });
    }
  });
  
  module.exports = router;

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
