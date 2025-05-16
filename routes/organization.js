const express = require('express');
const mongoose = require('mongoose');  // Import mongoose
const Organization = require('../models/organization');
const { User } = require('../models/user');
const { Event } = require('../models/event');
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
// GET all non-archived organizations
router.get('/', async (req, res) => {
  try {
    const organizations = await Organization.find({
      $or: [
        { isArchived: false },
        { isArchived: { $exists: false } }
      ]
    });
    res.status(200).json(organizations);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching organizations', error: err.message });
  }
});


// GET archived organizations
router.get('/archived', async (req, res) => {
  try {
    const archivedOrgs = await Organization.find({ isArchived: true });
    res.status(200).json(archivedOrgs);
  } catch (error) {
    console.error('Error fetching archived organizations:', error);
    res.status(500).json({ message: 'Error fetching archived organizations', error: error.message });
  }
});


router.get('/all-officers', async (req, res) => {
  try {
    const organizations = await Organization.find({});
    const allOfficers = organizations.flatMap(org => org.officers);
    res.status(200).json(allOfficers);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch officers', error: err.message });
  }
});


// Get eligible officers dynamically from User memberships
// router.get('/eligible-officers/:orgId', async (req, res) => {
//   try {
//     const { orgId } = req.params;

//     const organization = await Organization.findById(orgId);
//     if (!organization) {
//       return res.status(404).json({ message: 'Organization not found' });
//     }

//     // 1. Officers from the User collection
//     const users = await User.find({
//       organizations: {
//         $elemMatch: {
//           organization: orgId,
//           role: 'Officer',
//           isOfficer: true
//         }
//       }
//     }).select('name surname email _id');

//     // 2. Officers from the Organization schema
//     const orgOfficers = organization.officers || [];

//     // 3. Create a map of userId to user object for fast lookup
//     const userMap = new Map(users.map(user => [user._id.toString(), user]));

//     // 4. Merge both lists, ensuring no duplicates
//     const merged = [];

//     // Add all officers from the Organization schema
//     for (const officer of orgOfficers) {
//       const user = userMap.get(officer.userId?.toString());
//       merged.push({
//         _id: officer.userId || null,
//         name: user?.name || officer.name || '',
//         surname: user?.surname || officer.surname || '',
//         email: user?.email || officer.email || '',
//         position: officer.position || '',
//         image: officer.image || '',
//       });
//     }

//     // Add remaining officer users who were not in the orgOfficers list
//     for (const user of users) {
//       const alreadyIncluded = orgOfficers.some(
//         (officer) => officer.userId?.toString() === user._id.toString()
//       );
//       if (!alreadyIncluded) {
//         merged.push({
//           _id: user._id,
//           name: user.name,
//           surname: user.surname,
//           email: user.email,
//           position: '',
//           image: '',
//         });
//       }
//     }

//     res.status(200).json(merged);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: 'Failed to fetch eligible officers', error: err.message });
//   }
// });

// Route to delete (remove) a single officer and sync with User model
router.delete('/:orgId/officers/:userId', async (req, res) => {
  const { orgId, userId } = req.params;

  try {
    // Find the organization and remove the officer from the officers array
    const organization = await Organization.findByIdAndUpdate(
      orgId,
      {
        $pull: {
          officers: {
            $or: [{ userId: userId }, { _id: userId }],
          },
        },
      },
      { new: true }
    );

    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // Update the User model: Find the user and update their organization membership
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the specific organization in the user's organizations array
    const orgIndex = user.organizations.findIndex(org => org.organization.toString() === orgId);

    if (orgIndex === -1) {
      return res.status(404).json({ message: 'User is not a member of this organization' });
    }

    // Update the role and isOfficer flag in the user's organization membership
    user.organizations[orgIndex].role = 'User'; // Change role to 'User'
    user.organizations[orgIndex].isOfficer = false; // Set isOfficer to false

    await user.save(); // Save the updated user

    res.json({ message: 'Officer deleted successfully and role updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error deleting officer' });
  }
});

router.patch('/:orgId/officers/:userId', async (req, res) => {
  const { orgId, userId } = req.params;
  const { position } = req.body;

  try {
    const organization = await Organization.findById(orgId);
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    const officer = organization.officers.find(
      (off) =>
        (off.userId && off.userId.toString() === userId) ||
        off._id.toString() === userId
    );

    if (!officer) {
      return res.status(404).json({ message: 'Officer not found' });
    }

    if (position) {
      officer.position = position;
      organization.markModified('officers'); // ✅ Critical line
    }

    await organization.save();

    res.json({ message: 'Officer updated successfully', officer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating officer' });
  }
});

// Route to update and delete officers and sync with User model
router.get('/eligible-officers/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;

    const organization = await Organization.findById(orgId);
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // Get all User-based officers for this organization
    const users = await User.find({
      organizations: {
        $elemMatch: {
          organization: orgId,
          role: 'Officer',
          isOfficer: true
        }
      }
    }).select('_id name surname email image');

    const orgOfficers = organization.officers || [];

    // Map userId -> user
    const userMap = new Map(users.map(user => [user._id.toString(), user]));

    const merged = [];

    // Add all officers from Organization.officers list
    for (const officer of orgOfficers) {
      const user = userMap.get(officer.userId?.toString());
      merged.push({
        _id: officer.userId || null,
        name: user?.name || officer.name || '',
        surname: user?.surname || officer.surname || '',
        email: user?.email || officer.email || '',
        position: officer.position || '',
        image: user?.image || officer.image || '',  // prefer User.image
      });
    }

    // Add officer users not in Organization.officers
    for (const user of users) {
      const alreadyIncluded = orgOfficers.some(
        (officer) => officer.userId?.toString() === user._id.toString()
      );
      if (!alreadyIncluded) {
        merged.push({
          _id: user._id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          position: '',
          image: user.image || '',
        });
      }
    }

    res.status(200).json(merged);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch eligible officers', error: err.message });
  }
});

// Route to add a new officer to the organization (POST /organizations/:orgId/officers)
router.post('/:orgId/officers', uploadOptions.single('image'), async (req, res) => {
  try {
    const { orgId } = req.params;
    const { name, position, userId } = req.body;

    // Validate that the officer has a valid userId
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Find the organization
    const organization = await Organization.findById(orgId);
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // Create new officer object
    const newOfficer = {
      userId,
      name,
      position,
      image: null, // default image field (you can add this if image upload is optional)
    };

    // If a new image was uploaded, handle Cloudinary upload
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'image' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
      newOfficer.image = result.secure_url;
    }

    // Add the new officer to the organization's officers array
    organization.officers.push(newOfficer);

    // Save the organization
    await organization.save();

    res.status(200).json({ message: 'New officer added successfully', officer: newOfficer });
  } catch (error) {
    console.error('Error adding new officer:', error);
    res.status(500).json({ message: 'Error adding new officer', error: error.message });
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
    let imageUrl = existingOrganization.image; // Retain existing image by default

    // Determine department based on the new name (if name is updated)
    let department = existingOrganization.department;
    if (name) {
      const newDepartment = getDepartment(name);
      if (!newDepartment) {
        return res.status(400).json({ message: "Invalid organization name. Cannot determine department." });
      }
      department = newDepartment;
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
    if (imageUrl !== existingOrganization.image) existingOrganization.image = imageUrl;
    if (department !== existingOrganization.department) existingOrganization.department = department;

    // 🛠️ Only process officers IF explicitly provided AND non-empty string
    if (officers && officers.trim() !== "") {
      try {
        const parsedOfficers = JSON.parse(officers);

        if (!Array.isArray(parsedOfficers)) {
          return res.status(400).json({ message: "Invalid officers format. Expected a JSON array." });
        }

        const allOfficersValid = parsedOfficers.every(officer => officer.userId);
        if (!allOfficersValid) {
          return res.status(400).json({ message: "Each officer must have a userId." });
        }

        existingOrganization.officers = parsedOfficers;
      } catch (err) {
        return res.status(400).json({ message: "Invalid officers format. Expected JSON array." });
      }
    }

    // Save the updated organization
    const updatedOrganization = await existingOrganization.save();
    res.status(200).json(updatedOrganization);

  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({ message: 'Error updating organization', error: error.message });
  }
});


// Delete Organization by ID
// router.delete('/:id', async (req, res) => {
//   try {
//     const { id } = req.params;

//     // Validate MongoDB ObjectId
//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({ message: 'Invalid Organization ID' });
//     }

//     // Find the organization
//     const organization = await Organization.findById(id);
//     if (!organization) {
//       return res.status(404).json({ message: 'Organization not found' });
//     }

//     // Delete the image from Cloudinary (if exists)
//     if (organization.image) {
//       try {
//         const publicId = organization.image.split('/').pop().split('.')[0]; // Extract public ID
//         await cloudinary.uploader.destroy(publicId);
//       } catch (error) {
//         console.error('Error deleting image from Cloudinary:', error);
//       }
//     }

//     // Delete the organization from the database
//     await Organization.findByIdAndDelete(id);

//     res.status(200).json({ message: 'Organization deleted successfully' });
//   } catch (error) {
//     console.error('Error deleting organization:', error);
//     res.status(500).json({ message: 'Error deleting organization', error: error.message });
//   }
// });

//Archive
router.patch('/archive/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid Organization ID' });
    }

    const organization = await Organization.findById(id);
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    organization.isArchived = true;
    await organization.save();

    res.status(200).json({ message: 'Organization archived successfully' });
  } catch (error) {
    console.error('Error archiving organization:', error);
    res.status(500).json({ message: 'Error archiving organization', error: error.message });
  }
});

//Unarchive
router.patch('/unarchive/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid Organization ID' });
    }

    const organization = await Organization.findById(id);
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    organization.isArchived = false;
    await organization.save();

    res.status(200).json({ message: 'Organization unarchived successfully' });
  } catch (error) {
    console.error('Error unarchiving organization:', error);
    res.status(500).json({ message: 'Error unarchiving organization', error: error.message });
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

// GET /api/organizations/:id/events
router.get('/:id/events', async (req, res) => {
  const organizationId = req.params.id;

  try {
    // 1️⃣ Find the organization by ID
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // 2️⃣ Find events where event.organization === organization.name
    const events = await Event.find({ organization: organization.name });

    // 3️⃣ Return both organization info and its events
    res.json({
      organization: {
        _id: organization._id,
        name: organization.name,
        description: organization.description,
        department: organization.department,
        image: organization.image,
        category: organization.category,
      },
      events: events
    });

  } catch (error) {
    console.error('Error fetching organization events:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;