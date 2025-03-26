const express = require('express');
const mongoose = require('mongoose');  // Import mongoose
const Organization = require('../models/organization');
const { User } = require('../models/user');
const cloudinary = require('../utils/cloudinary');
const uploadOptions = require('../utils/multer');
const streamifier = require('streamifier');
const router = express.Router();

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
      return "Multiple";
  }
};

// New Category Mapping Function
const getCategory = (selectedOrganization) => {
  const academicList = [
    "Association of Civil Engineering Students of TUP Taguig Campus",
    "Automotive Society of Engineering",
    "Bachelor of Science in Electrical Engineering Guild",
    "Die and Mould Maker Society - TUPTaguig",
    "Electromechanics Society",
    "Green Chemistry Society",
    "Institute of Electronics Engineers of the Philippines - TUPT Student Chapter",
    "Instrumentation and Control Society - TUPT Student Chapter",
    "Junior Philippine Society of Mechanical Engineers",
    "Junior Society of Heating, Refrigeration and Air Conditioning Engineers",
    "Manila Technician Institute Computer Society",
    "Mechanical Technologies and Leader’s Society",
    "Mechatronics and Robotics Society of the Philippines Taguig Student Chapter",
    "Technical Educators Society - TUP Taguig",
    "TUP Taguig Society of Nondestructive Testing"
  ];

  const nonAcademicList = [
    "DOST Scholars Association for Innovation and Technology",
    "Peer Facilitators Group",
    "LANI Scholars of Technology and Engineering Pioneers"
  ];

  const multiFaithList = [
    "Catholic Youth Movement",
    "Christian Brotherhood International",
    "Manila Technician Institute Christian Fellowship",
    "TUPT Positive Lifestyle Under the Son Network",
    "The Jesus Impact - TUP"
  ];

  // Normalize for case-insensitive comparison
  const orgName = selectedOrganization.trim().toLowerCase();

  if (academicList.some(item => item.toLowerCase() === orgName)) {
    return "Academic";
  } else if (nonAcademicList.some(item => item.toLowerCase() === orgName)) {
    return "Non Academic";
  } else if (multiFaithList.some(item => item.toLowerCase() === orgName)) {
    return "Multi-Faith";
  } else {
    return "Unknown";
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

    // Determine category based on the organization name
    const category = getCategory(name);

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

    // Create new organization including the category field
    const organization = new Organization({
      name,
      description,
      department,
      category, // <-- Added category field
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

// Bulk Create Organizations Route
router.post("/bulk", uploadOptions.any(), async (req, res) => {
  try {
    // Parse the organizations array from the form data
    const organizationsData = JSON.parse(req.body.organizations);
    if (!Array.isArray(organizationsData)) {
      return res.status(400).json({ message: "Organizations data must be an array" });
    }

    // Build a mapping from file field names to file objects
    const filesMap = {};
    if (req.files) {
      req.files.forEach(file => {
        filesMap[file.fieldname] = file;
      });
    }

    const savedOrganizations = [];

    for (let i = 0; i < organizationsData.length; i++) {
      const orgData = organizationsData[i];
      const { name, description, officers } = orgData;

      if (!name || !description) {
        return res.status(400).json({ message: "Name and description are required for each organization" });
      }

      // Determine department and category using the helper functions
      const department = getDepartment(name);
      const category = getCategory(name);
      let imageUrl = "";

      // Check if an image file exists for this organization
      const fileKey = `image_${i}`;
      if (filesMap[fileKey]) {
        const file = filesMap[fileKey];
        imageUrl = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { resource_type: "image" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result.secure_url);
            }
          );
          streamifier.createReadStream(file.buffer).pipe(stream);
        });
      }

      // Create a new Organization including the computed fields
      const organization = new Organization({
        name,
        description,
        department,
        category,
        image: imageUrl,
        officers, // optional, if provided
      });

      const savedOrg = await organization.save();
      savedOrganizations.push(savedOrg);
    }

    res.status(201).json(savedOrganizations);
  } catch (error) {
    console.error("Error creating organizations in bulk:", error);
    res.status(500).json({ message: "Error creating organizations", error: error.message });
  }
});

// Get All Organizations
router.get('/', async (req, res) => {
  try {
    // Sort organizations by name in ascending order (alphabetical order)
    const organizations = await Organization.find().sort({ name: 1 });
    res.status(200).json(organizations);
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ message: 'Error fetching organizations', error: error.message });
  }
});

// Modified Eligible Officers Route
// Get eligible officers for an organization (from the Organization document)
router.get("/eligible-officers/:organizationId", async (req, res) => {
  try {
    const { organizationId } = req.params;

    // Validate organizationId
    if (!mongoose.Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({ message: "Invalid organization ID" });
    }

    // Fetch the organization by ID and select only the officers field
    const organization = await Organization.findById(organizationId).select('officers');

    if (!organization) {
      return res.status(404).json({ message: "Organization not found" });
    }

    // Return the officers array from the organization document
    res.status(200).json(organization.officers);
  } catch (error) {
    console.error("Error fetching officers:", error.message);
    res.status(500).json({ message: "Error fetching officers", error: error.message });
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
    // console.log("Organization Details:");
    // console.log("Name:", organization.name);
    // console.log("Description:", organization.description);
    // console.log("Image:", organization.image);
    // console.log("Other Details:", organization);

    res.status(200).json(organization);
  } catch (error) {
    console.error('Error fetching organization:', error);
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

// Route to update and delete officers only
router.patch('/:id/officers', uploadOptions.any(), async (req, res) => {
  try {
    const organizationId = req.params.id;
    // Check if req.body.officers is a string (from FormData) or already an object (from JSON)
    const officersData = typeof req.body.officers === 'string'
      ? JSON.parse(req.body.officers)
      : req.body.officers;
    
    // Build a map from file field names to file objects from req.files.
    const filesMap = {};
    if (req.files) {
      req.files.forEach(file => {
        filesMap[file.fieldname] = file;
      });
    }

    // For each officer, if a file is uploaded for that officer (e.g. field "image_0" for first officer),
    // upload the file to Cloudinary and replace the image field with the secure URL.
    const processedOfficers = await Promise.all(
      officersData.map(async (officer, index) => {
        const fileField = `image_${index}`;
        if (filesMap[fileField]) {
          const file = filesMap[fileField];
          const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { resource_type: 'image' },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            streamifier.createReadStream(file.buffer).pipe(stream);
          });
          officer.image = result.secure_url;
        }
        return officer;
      })
    );

    // Update the organization with the processed officers array. 
    const updatedOrganization = await Organization.findByIdAndUpdate(
      organizationId,
      { officers: processedOfficers },
      { new: true }
    ).select('officers image'); // Select officers and image fields

    if (!updatedOrganization) {
      return res.status(404).json({ message: 'Organization not found.' });
    }

    res.status(200).json({
      officers: updatedOrganization.officers,
      image: updatedOrganization.image
    });
  } catch (error) {
    console.error('Error updating officers:', error);
    res.status(500).json({ message: 'Error updating officers', error: error.message });
  }
});

// Get the total number of Organizations
router.get('/get/count', async (req, res) => {
  try {
    const orgCount = await Organization.countDocuments();
    res.status(200).json({ orgCount });
  } catch (error) {
    console.error('Error fetching organization count:', error);
    res.status(500).json({ message: 'Error fetching organization count', error: error.message });
  }
});

module.exports = router;
