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
    case "Association of Civil Engineering Students of TUP Taguig Campus":
    case "GreeCS":
    case "Green Chemistry Society TUP - Taguig":
      return "Civil and Allied Department";
  
    case "TEST":
    case "Technical Educators Society – TUP Taguig":
      return "Basic Arts and Sciences Department";
  
    case "BSEEG":
    case "Bachelor of Science in Electrical Engineering Guild":
    case "IECEP":
    case "Institute of Electronics Engineers of the Philippines – TUPT Student Chapter":
    case "ICS":
    case "Instrumentation and Control Society – TUPT Student Chapter":
    case "MTICS":
    case "Manila Technician Institute Computer Society":
    case "MRSP":
    case "Mechatronics and Robotics Society of the Philippines Taguig Student Chapter":
      return "Electrical and Allied Department";
  
    case "ASE":
    case "Automotive Society of Engineering":
    case "DMMS":
    case "Die and Mould Maker Society – TUP Taguig":
    case "EleMechS":
    case "Electromechanics Society":
    case "JPSME":
    case "Junior Philippine Society of Mechanical Engineers":
    case "JSHRAE":
    case "Junior Society of Heating, Refrigeration and Air Conditioning Engineers":
    case "METALS":
    case "Mechanical Technologies and Leader’s Society":
    case "TSNT":
    case "TUP Taguig Society of Nondestructive Testing":
      return "Mechanical and Allied Department";
  
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

// Update Organization by ID
router.put('/:id', uploadOptions.single('image'), async (req, res) => {
  try {
      const { id } = req.params;

      // Validate MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ message: 'Invalid Organization ID' });
      }

      // Find the existing organization
      const existingOrganization = await Organization.findById(id);
      if (!existingOrganization) {
          return res.status(404).json({ message: 'Organization not found' });
      }

      const { name, description, officers } = req.body;
      let imageUrl = existingOrganization.image; // Retain the existing image by default

      // Determine department based on the new name (if name is updated)
      let department = existingOrganization.department;
      if (name) {
          department = getDepartment(name);
          if (!department) {
              return res.status(400).json({ message: "Invalid organization name. Cannot determine department." });
          }
      }

      // Check if a new image is uploaded
      if (req.file) {
          try {
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
          } catch (uploadError) {
              return res.status(500).json({ message: "Image upload failed", error: uploadError.message });
          }
      }

      // Update fields only if they are provided in the request
      if (name) existingOrganization.name = name;
      if (description) existingOrganization.description = description;
      if (officers) existingOrganization.officers = officers;
      if (imageUrl !== existingOrganization.image) existingOrganization.image = imageUrl;
      if (department !== existingOrganization.department) existingOrganization.department = department;

      // Save the updated organization
      const updatedOrganization = await existingOrganization.save();
      res.status(200).json(updatedOrganization);

  } catch (error) {
      console.error('Error updating organization:', error);
      res.status(500).json({ message: 'Error updating organization', error: error.message });
  }
});

// Delete Organization by ID
router.delete('/:id', async (req, res) => {
  try {
      const { id } = req.params;

      // Validate MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ message: 'Invalid Organization ID' });
      }

      // Find the organization
      const organization = await Organization.findById(id);
      if (!organization) {
          return res.status(404).json({ message: 'Organization not found' });
      }

      // Delete the image from Cloudinary (if exists)
      if (organization.image) {
          try {
              const publicId = organization.image.split('/').pop().split('.')[0]; // Extract public ID
              await cloudinary.uploader.destroy(publicId);
          } catch (error) {
              console.error('Error deleting image from Cloudinary:', error);
          }
      }

      // Delete the organization from the database
      await Organization.findByIdAndDelete(id);

      res.status(200).json({ message: 'Organization deleted successfully' });
  } catch (error) {
      console.error('Error deleting organization:', error);
      res.status(500).json({ message: 'Error deleting organization', error: error.message });
  }
});

module.exports = router;
