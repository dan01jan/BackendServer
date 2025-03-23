const { User } = require("../models/user");
const Organization = require("../models/organization");
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const { OAuth2 } = google.auth;
const authJwt = require("../helpers/jwt");
const client = new OAuth2(
  "920213136950-8j3ng8qursis2pib3qhav9q2larqfu89.apps.googleusercontent.com"
);
const cloudinary = require("../utils/cloudinary");
const uploadOptions = require("../utils/multer");
const streamifier = require("streamifier");

// Register User
router.post("/register", uploadOptions.single("image"), async (req, res) => {
  if (!req.body.email.endsWith("@tup.edu.ph")) {
    return res
      .status(400)
      .send("Email must be a TUP email (ending with @tup.edu.ph)");
  }

  const file = req.file;
  if (!file) return res.status(400).send("No image in the request");

  try {
    // Upload image to Cloudinary
    const uploadSingleFile = (file) => {
      return new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ resource_type: "image" }, (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result.secure_url);
            }
          })
          .end(file.buffer);
      });
    };

    const imageUrl = await uploadSingleFile(file);

    // Parse the organization selections from the form data
    let orgSelections = [];
    if (req.body.orgSelections) {
      try {
        orgSelections = JSON.parse(req.body.orgSelections);
      } catch (e) {
        return res.status(400).send("Invalid organization selections data.");
      }
    }

    // Validate: allow at most one Officer role
    const officerCount = orgSelections.filter(
      (sel) => sel.role === "Officer"
    ).length;
    if (officerCount > 1) {
      return res
        .status(400)
        .send("You can only be an officer for one organization.");
    }

    // Process orgSelections: For officer roles, explicitly set isOfficer to false (pending approval)
    const processedOrgSelections = orgSelections.map((org) => {
      if (org.role === "Officer") {
        return { ...org, isOfficer: false };
      }
      return org;
    });

    // Create the user (note: no top-level isOfficer property)
    let user = new User({
      name: req.body.name,
      surname: req.body.surname,
      email: req.body.email,
      passwordHash: bcrypt.hashSync(req.body.password, 10),
      organizations: processedOrgSelections,
      course: req.body.course,
      section: req.body.section,
      image: imageUrl,
      isAdmin: req.body.isAdmin,
      isHead: req.body.isHead,
      declined: req.body.declined,
      isVerified: true,
    });

    user = await user.save();

    if (!user)
      return res.status(400).send("The user cannot be created!");

    // Optionally, send back all organizations (for selection, etc.)
    const organizations = await Organization.find().select("name");

    res.status(200).json({
      message: "Registration successful.",
      user: user,
      organizations: organizations,
    });
  } catch (error) {
    console.error("Error processing the user:", error);
    res.status(500).send("Error processing the user: " + error.message);
  }
});

// Get Admin Users (Officer)
router.get("/officer/:id", async (req, res) => {
  try {
    const userId = req.params.id; // Get userId from URL parameter
    // Populate the nested organizations.organization field
    const officer = await User.findById(userId)
      .select("-passwordHash")
      .populate("organizations.organization", "name");

    if (!officer) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!officer.isOfficer) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied" });
    }

    res.status(200).json(officer);
  } catch (error) {
    console.error("Error fetching admin user:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get Users
router.get(`/`, async (req, res) => {
  const userList = await User.find().select("-passwordHash");
  console.log(userList);

  if (!userList) {
    res.status(500).json({ success: false });
  }
  res.send(userList);
});

// User Profile (Mobile)
router.get("/me", authJwt, async (req, res) => {
  try {
    const userId = req.user.userId; // Assuming you store userId in the JWT payload
    const user = await User.findById(userId).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get Specific User
router.get("/:id", async (req, res) => {
  const user = await User.findById(req.params.id).select("-passwordHash");

  if (!user) {
    res
      .status(500)
      .json({ message: "The user with the given ID was not found." });
  }
  res.status(200).send(user);
});

// Get Specific User by Email
router.get("/email/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email }).select("name");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update User (with image)
router.put("/update/:id", uploadOptions.single("image"), async (req, res) => {
  try {
    const userExist = await User.findById(req.params.id);
    if (!userExist) {
      return res.status(404).send("User not found");
    }

    const file = req.file;
    if (!file) {
      return res.status(400).send("No image in the request");
    }

    const fileName = file.filename;
    const basePath = `${req.protocol}://${req.get("host")}/public/uploads/`;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        street: req.body.street,
        apartment: req.body.apartment,
        zip: req.body.zip,
        city: req.body.city,
        country: req.body.country,
        image: `${basePath}${fileName}`,
      },
      { new: true }
    );

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update User (without image)
router.put("/:id", async (req, res) => {
  try {
    const userExist = await User.findById(req.params.id);
    if (!userExist) {
      return res.status(404).send("User not found");
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name,
        email: req.body.email,
        // Removed: isOfficer: req.body.isOfficer,
      },
      { new: true }
    );

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Login User (API)
router.post("/login", async (req, res) => {
  console.log(req.body.email);
  const user = await User.findOne({ email: req.body.email });

  const secret = process.env.secret;
  if (!user) {
    return res.status(400).send("The user not found");
  }

  if (user && bcrypt.compareSync(req.body.password, user.passwordHash)) {
    const token = jwt.sign(
      {
        userId: user.id,
      },
      secret,
      { expiresIn: "1d" }
    );
    console.log(`Login successful for user: ${user.email}, Token: ${token}`);
    res.status(200).send({ user: user.email, token: token });
  } else {
    res.status(400).send("Password is wrong!");
  }
});

// Delete User
router.delete("/:id", (req, res) => {
  User.findByIdAndRemove(req.params.id)
    .then((user) => {
      if (user) {
        return res
          .status(200)
          .json({ success: true, message: "The user is deleted!" });
      } else {
        return res
          .status(404)
          .json({ success: false, message: "User not found!" });
      }
    })
    .catch((err) => {
      return res.status(500).json({ success: false, error: err });
    });
});

// Get total number of users for all users
router.get(`/get/count`, async (req, res) => {
  const userCount = await User.countDocuments();

  if (!userCount) {
    res.status(500).json({ success: false });
  }
  res.send({
    userCount: userCount,
  });
});

// Google Login
router.post("/google_login", async (req, res) => {
  try {
    const { tokenId } = req.body;
    const verify = await client.verifyIdToken({
      idToken: tokenId,
      audience:
        "405532974722-t5a0lvua754v8jkc1lc4uvtkv305ghtm.apps.googleusercontent.com",
    });

    const { email_verified, email, name } = verify.payload;

    if (!email_verified) {
      return res.status(400).json({ msg: "Email verification failed." });
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = new User({ name, email });
      await user.save();
    }

    const token = jwt.sign(
      {
        userId: user._id,
        isOfficer: user.isOfficer,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_TIME }
    );

    res.status(200).json({ msg: "Login successful", user, token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: err.message });
  }
});

// Get User Image
router.get("/image/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("image");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user.image);
  } catch (error) {
    console.error("Error fetching user image:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Web Login (for web-based authentication)
router.post("/weblogin", async (req, res) => {
  console.log(req.body.email);

  try {
    // Populate the nested organizations.organization field
    const user = await User.findOne({ email: req.body.email }).populate(
      "organizations.organization",
      "name"
    );

    const secret = process.env.secret;

    if (!user) {
      return res.status(400).send("User not found");
    }

    if (bcrypt.compareSync(req.body.password, user.passwordHash)) {
      const token = jwt.sign(
        {
          userId: user.id,
        },
        secret,
        { expiresIn: "1d" }
      );

      console.log(`Login successful for user: ${user.email}, Token: ${token}`);

      // Use the first organization membership as primary (if any)
      const primaryMembership =
        user.organizations && user.organizations.length > 0
          ? user.organizations[0]
          : {};

      return res.status(200).send({
        user: {
          userId: user.id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          organizationId: primaryMembership.organization
            ? primaryMembership.organization._id
            : null,
          organizationName: primaryMembership.organization
            ? primaryMembership.organization.name
            : null,
          department: primaryMembership.department || null,
          course: user.course,
          image: user.image,
          isAdmin: user.isAdmin,
          isOfficer: user.isOfficer,
        },
        token: token,
      });
    } else {
      return res.status(400).send("Password is wrong!");
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).send("Internal server error");
  }
});

// Aggregation on the "users" collection to group pending officer requests by organization.
router.get("/organizations/officers", async (req, res) => {
  try {
    const organizations = await Organization.aggregate([
      {
        $lookup: {
          from: "users",
          let: { orgId: "$_id" },
          pipeline: [
            // Only consider users that haven't been declined.
            { $match: { declined: false } },
            // Unwind each user's organizations array.
            { $unwind: "$organizations" },
            // Only match memberships for the current organization that are pending officer requests.
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$organizations.organization", "$$orgId"] },
                    { $eq: ["$organizations.role", "Officer"] },
                    { $eq: ["$organizations.isOfficer", false] }
                  ]
                }
              }
            },
            // Project only the fields needed for the officer.
            {
              $project: {
                _id: 1,
                name: 1,
                surname: 1,
                email: 1,
                image: 1,
                department: "$organizations.department"
              }
            }
          ],
          as: "officers"
        }
      },
      // Optionally, project only the fields you need from the organization.
      {
        $project: {
          _id: 1,
          name: 1,
          officers: 1
        }
      }
    ]);

    res.json(organizations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Decline an Officer
router.put("/organizations/officers/:userId/decline", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "Officer not found." });
    }
    const membership = user.organizations.find(m =>
      m.role.toLowerCase() === 'officer'
    );
    if (!membership) {
      return res.status(404).json({ error: "Officer membership not found." });
    }
    membership.isOfficer = false; // Decline the officer status
    user.declined = true; // Optional: mark the user as declined if needed
    await user.save();
    res.json({
      message: "Officer declined successfully.",
      officer: user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Approve an Officer
router.put("/organizations/officers/:userId/approve", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "Officer not found." });
    }
    // Find the officer membership (assuming one officer membership per user)
    const membership = user.organizations.find(m =>
      m.role.toLowerCase() === 'officer'
    );
    if (!membership) {
      return res.status(404).json({ error: "Officer membership not found." });
    }
    membership.isOfficer = true; // Approve the officer status
    await user.save();
    res.json({
      message: "Officer approved successfully.",
      officer: user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Count total users for a specific organization (using organizations array)
router.get("/organization/:id/count", async (req, res) => {
  try {
    const orgId = req.params.id;

    // Count users whose organizations array contains an entry with organization equals orgId
    const userCount = await User.countDocuments({
      "organizations.organization": orgId
    });

    res.status(200).json({ organizationId: orgId, userCount });
  } catch (error) {
    console.error("Error counting users for organization:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Count officer users for a specific organization
router.get("/organization/:id/officers/count", async (req, res) => {
  try {
    const orgId = req.params.id;

    // Count users that have at least one membership with role "Officer" and isOfficer true for the given organization
    const officerCount = await User.countDocuments({
      organizations: {
        $elemMatch: {
          organization: orgId,
          role: { $regex: /^officer$/i },
          isOfficer: true,
        },
      },
    });

    res.status(200).json({ organizationId: orgId, officerCount });
  } catch (error) {
    console.error("Error counting officer users for organization:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
