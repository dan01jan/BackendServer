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
  // Check if the email is a TUP email
  if (!req.body.email.endsWith('@tup.edu.ph')) {
    return res.status(400).send("Email must be a TUP email (ending with @tup.edu.ph)");
  }

  const file = req.file;
  if (!file) return res.status(400).send("No image in the request");

  try {
    // Function to upload a single file to Cloudinary
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

    // Generate a 6-digit OTP and set expiry (10 minutes)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    let user = new User({
      name: req.body.name,
      surname: req.body.surname,
      email: req.body.email,
      passwordHash: bcrypt.hashSync(req.body.password, 10),
      role: req.body.role,
      organization: req.body.organization,
      department: req.body.department,
      image: imageUrl,
      isAdmin: req.body.isAdmin,
      isOfficer: req.body.isOfficer,
      isHead: req.body.isHead,
      declined: req.body.declined,
      course: req.body.course,
      section: req.body.section,
      // New OTP fields
      otp: otp,
      otpExpires: otpExpires,
      isVerified: false,
    });

    user = await user.save();

    if (!user) return res.status(400).send("The user cannot be created!");

    // Set up Nodemailer transporter (ensure your .env variables are set)
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // Your email from .env
        pass: process.env.EMAIL_PASS, // Your password from .env
      },
    });

    // Define the email options with the OTP
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Your OTP Code for TUP Account Verification",
      html: `<p>Your OTP code is <b>${otp}</b>. It expires in 10 minutes.</p>`,
    };

    // Send the OTP email
    await transporter.sendMail(mailOptions);

    // Fetch organizations to send back with the response
    const organizations = await Organization.find().select("name");

    res.status(200).json({
      message: "Registration successful. Please verify your email using the OTP sent.",
      user: user,
      organizations: organizations,
    });
  } catch (error) {
    console.error("Error processing the user:", error);
    res.status(500).send("Error processing the user: " + error.message);
  }
});


router.post("/verify-otp", async (req, res) => {
  try {
    let { email, otp } = req.body;

    // Normalize and trim the inputs
    email = email.trim().toLowerCase();
    otp = otp.trim();

    // Debug logs
    console.log("Verify OTP Request:");
    console.log("Incoming Email:", email);
    console.log("Incoming OTP:", otp);

    const user = await User.findOne({ email });
    if (!user) {
      console.log("User not found for email:", email);
      return res.status(404).send("User not found.");
    }

    console.log("Stored OTP in DB:", user.otp);
    console.log("User isVerified (type & value):", typeof user.isVerified, user.isVerified);

    if (user.isVerified) {
      console.log("User already verified for email:", email);
      return res.status(400).send("User is already verified.");
    }

    if (user.otp !== otp) {
      console.log("OTP mismatch: Expected", user.otp, "but got", otp);
      return res.status(400).send("Invalid OTP.");
    }

    if (user.otpExpires < Date.now()) {
      console.log("OTP has expired. Expiry:", user.otpExpires, "Current:", Date.now());
      return res.status(400).send("OTP has expired.");
    }

    // Update user verification status
    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    console.log("User verified successfully:", email);
    res.send("Email verified successfully.");
  } catch (error) {
    console.error("Error during OTP verification:", error);
    res.status(500).send("Server error during OTP verification.");
  }
});

router.post("/resend-otp", async (req, res) => {
  const { email } = req.body;

  try {
      const user = await User.findOne({ email });

      if (!user) {
          return res.status(404).send("User not found.");
      }

      // Generate a new OTP and set expiry (10 minutes)
      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

      // Update the user's OTP
      user.otp = newOtp;
      user.otpExpires = otpExpires;
      await user.save();

      // Set up Nodemailer transporter
      let transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
              user: process.env.EMAIL_USER, // Your email
              pass: process.env.EMAIL_PASS, // Your password
          },
      });

      // Define the email with the new OTP
      const mailOptions = {
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: "Your New OTP Code for TUP Account Verification",
          html: `<p>Your new OTP code is <b>${newOtp}</b>. It expires in 10 minutes.</p>`,
      };

      // Send the OTP email
      await transporter.sendMail(mailOptions);

      res.status(200).json({ message: "OTP has been resent successfully." });
  } catch (error) {
      console.error("Error resending OTP:", error);
      res.status(500).send("Error resending OTP: " + error.message);
  }
});

// Get Admin Users
router.get("/officer/:id", async (req, res) => {
  try {
    const userId = req.params.id; // Get userId from URL parameter
    const officer = await User.findById(userId)
      .select("-passwordHash")
      .populate("organization", "name");

    if (!officer) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!officer.isOfficer) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    res.status(200).json(officer);
  } catch (error) {
    console.error("Error fetching admin user:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get Users
router.get(`/`, async (req, res) => {
  // const userList = await User.find();
  const userList = await User.find().select("-passwordHash");
  console.log(userList);

  if (!userList) {
    res.status(500).json({ success: false });
  }
  res.send(userList);
});

//User Profile (Mobile)
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

// Get Specific User (di ata to ginamit)
router.get("/:id", async (req, res) => {
  const user = await User.findById(req.params.id).select("-passwordHash");

  if (!user) {
    res
      .status(500)
      .json({ message: "The user with the given ID was not found." });
  }
  res.status(200).send(user);
});

// for behavioral analysis chart picker
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select("name surname");
    if (user) {
      res.status(200).json(user);
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get Specific User Email (di ata to ginamit)
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

// Update User (di ata to ginamit)
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

// (di ata to ginamit)
router.put("/:id", async (req, res) => {
  try {
    const userExist = await User.findById(req.params.id);
    if (!userExist) {
      return res.status(404).send("User not found");
    }

    // let newPassword;
    // if (req.body.password) {
    //     newPassword = bcrypt.hashSync(req.body.password, 10);
    // } else {
    //     newPassword = userExist.passwordHash;
    // }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name,
        email: req.body.email,
        // passwordHash: newPassword,
        // phone: req.body.phone,
        isOfficer: req.body.isOfficer,
        // isAdmin: req.body.isAdmin,
        // street: req.body.street,
        // apartment: req.body.apartment,
        // zip: req.body.zip,
        // city: req.body.city,
        // country: req.body.country,
      },
      { new: true }
    );

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Login User
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
        // isAdmin: user.isAdmin
      },
      secret,
      { expiresIn: "1d" }
    );
    console.log(`Login successful for user: ${user.email}, Token: ${token}`);
    res.status(200).send({ user: user.email, token: token });
  } else {
    res.status(400).send("password is wrong!");
  }
});

// Delete User (di ata to ginamit)
router.delete("/:id", (req, res) => {
  User.findByIdAndRemove(req.params.id)
    .then((user) => {
      if (user) {
        return res
          .status(200)
          .json({ success: true, message: "the user is deleted!" });
      } else {
        return res
          .status(404)
          .json({ success: false, message: "user not found!" });
      }
    })
    .catch((err) => {
      return res.status(500).json({ success: false, error: err });
    });
});

// (di ata to ginamit)
router.get(`/get/count`, async (req, res) => {
  const userCount = await User.countDocuments((count) => count);

  if (!userCount) {
    res.status(500).json({ success: false });
  }
  res.send({
    userCount: userCount,
  });
});

// (di to ginamit)
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
        userId: user._id, // use _id from MongoDB
        isOfficer: user.isOfficer,
      },
      process.env.JWT_SECRET, // Using environment variable for JWT secret
      { expiresIn: process.env.JWT_EXPIRES_TIME } // Using environment variable for token expiration
    );

    // Return the JWT token along with user information
    res.status(200).json({ msg: "Login successful", user, token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: err.message });
  }
});

// (di to ginamit)
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

router.post("/weblogin", async (req, res) => {
  console.log(req.body.email);

  try {
    // Find user and populate organization name
    const user = await User.findOne({ email: req.body.email }).populate(
      "organization",
      "name"
    );

    const secret = process.env.secret;

    if (!user) {
      return res.status(400).send("User not found");
    }

    // Compare the password with the hash
    if (bcrypt.compareSync(req.body.password, user.passwordHash)) {
      const token = jwt.sign(
        {
          userId: user.id, // User ID in the JWT payload
        },
        secret,
        { expiresIn: "1d" }
      );

      console.log(`Login successful for user: ${user.email}, Token: ${token}`);

      // Send back the user data including organization name
      return res.status(200).send({
        user: {
          userId: user.id, // User ID
          name: user.name,
          surname: user.surname,
          email: user.email,
          organizationId: user.organization._id, // Organization ID
          organizationName: user.organization.name, // Organization Name
          department: user.department,
          course: user.course,
          image:user.image,
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

// Get Officer Role
router.get('/organizations/officers', async (req, res) => {
  try {
    const organizationsWithOfficers = await Organization.aggregate([
      {
        $lookup: {
          from: "users", // ensure this matches your collection name
          localField: "_id",
          foreignField: "organization",
          as: "users"
        }
      },
      {
        $addFields: {
          officers: {
            $filter: {
              input: "$users",
              as: "user",
              cond: {
                $and: [
                  { $eq: [{ $toLower: "$$user.role" }, "officer"] },
                  { $eq: ["$$user.isOfficer", false] },
                  { $eq: ["$$user.declined", false] }
                ]
              }
            }
          }
        }
      },
      {
        $project: {
          name: 1,       // organization name
          officers: 1
        }
      }
    ]);

    res.json(organizationsWithOfficers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/organizations/officers/:userId/decline', async (req, res) => {
  try {
    const { userId } = req.params;
    // Set declined to true so that the user is removed from pending list.
    const updatedOfficer = await User.findByIdAndUpdate(
      userId,
      { declined: true },
      { new: true }
    );

    if (!updatedOfficer) {
      return res.status(404).json({ error: 'Officer not found.' });
    }

    res.json({
      message: 'Officer declined successfully.',
      officer: updatedOfficer
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});


router.put('/organizations/officers/:userId/approve', async (req, res) => {
  try {
    const { userId } = req.params;

    // Find the user by ID and update isOfficer to true.
    const updatedOfficer = await User.findByIdAndUpdate(
      userId,
      { isOfficer: true },
      { new: true }
    );

    if (!updatedOfficer) {
      return res.status(404).json({ error: 'Officer not found.' });
    }

    res.json({
      message: 'Officer approved successfully.',
      officer: updatedOfficer
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Route to get the total number of users for a specific organization
router.get("/organization/:id/count", async (req, res) => {
  try {
    const orgId = req.params.id;

    // Count users whose organization field matches the provided orgId
    const userCount = await User.countDocuments({ organization: orgId });

    res.status(200).json({ organizationId: orgId, userCount });
  } catch (error) {
    console.error("Error counting users for organization:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Route to count officer users (role "officer" and isOfficer = true) for a specific organization
router.get("/organization/:id/officers/count", async (req, res) => {
  try {
    const orgId = req.params.id;

    // Count users whose organization field matches orgId,
    // role is "officer" (case-insensitive) and isOfficer is true
    const officerCount = await User.countDocuments({
      organization: orgId,
      role: { $regex: /^officer$/i },
      isOfficer: true
    });

    res.status(200).json({ organizationId: orgId, officerCount });
  } catch (error) {
    console.error("Error counting officer users for organization:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
