const express = require("express");
const { Event } = require("../models/event");
const { User } = require("../models/user");
const { Type } = require("../models/type");
const { Location } = require("../models/location");
const { Organization } = require("../models/type");
const router = express.Router();
const mongoose = require("mongoose");
const cloudinary = require("../utils/cloudinary");
const uploadOptions = require("../utils/multer");
const streamifier = require("streamifier");
const { captureRejectionSymbol } = require("nodemailer/lib/xoauth2");

const http = require("https");
// const FILE_TYPE_MAP = {
//     'image/png': 'png',
//     'image/jpeg': 'jpeg',
//     'image/jpg': 'jpg'
// };

// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         const isValid = FILE_TYPE_MAP[file.mimetype];
//         let uploadError = new Error('invalid image type');

//         if (isValid) {
//             uploadError = null;
//         }
//         cb(uploadError, 'public/uploads');
//     },
//     filename: function (req, file, cb) {
//         const fileName = file.originalname.split(' ').join('-');
//         const extension = FILE_TYPE_MAP[file.mimetype];
//         cb(null, `${fileName}-${Date.now()}.${extension}`);
//     }
// });

// const uploadOptions = multer({ storage: storage });

// Get All Events
router.get(`/`, async (req, res) => {
  const { type } = req.query;

  try {
    let events;

    if (type) {
      // Ensure type is converted to ObjectId for comparison if it's a string
      const eventTypeId = mongoose.Types.ObjectId(type);

      const eventType = await Type.findById(eventTypeId);
      if (!eventType) {
        return res
          .status(200)
          .json({ message: "No events found for the given type" });
      }

      events = await Event.find({ type: eventTypeId }).populate("type");
    } else {
      // Fetch all events and populate the type
      events = await Event.find().populate("type");
    }

    if (events.length === 0) {
      return res.status(200).json({ message: "No events found" });
    }

    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/events", async (req, res) => {
  try {
    const events = await Event.find().lean();

    // Extract valid ObjectId locations and types
    const locationIds = events
      .filter((e) => mongoose.Types.ObjectId.isValid(e.location))
      .map((e) => e.location);

    const typeIds = events
      .filter((e) => mongoose.Types.ObjectId.isValid(e.type))
      .map((e) => e.type);

    // Fetch location docs
    const locations = await Location.find({ _id: { $in: locationIds } }).lean();
    const locationMap = {};
    locations.forEach((loc) => {
      locationMap[loc._id.toString()] = loc.name;
    });

    // Fetch type docs
    const types = await Type.find({ _id: { $in: typeIds } }).lean();
    const typeMap = {};
    types.forEach((type) => {
      typeMap[type._id.toString()] =
        type.eventType || type.name || "Unknown Type";
    });

    // Replace ObjectId fields with names
    const finalEvents = events.map((event) => {
      if (mongoose.Types.ObjectId.isValid(event.location)) {
        event.location =
          locationMap[event.location.toString()] || "Unknown Location";
      }
      if (mongoose.Types.ObjectId.isValid(event.type)) {
        event.type = {
          eventType: typeMap[event.type.toString()] || "Unknown Type",
        };
      }
      return event;
    });

    res.json(finalEvents);
  } catch (error) {
    console.error("Error in GET /events:", error);
    res
      .status(500)
      .json({ message: "Error fetching events", error: error.message });
  }
});

router.get("/getEventTypeById/:type", async (req, res) => {
  const { type } = req.params; // The _id of the eventType to search for
  try {
    // Search for the eventType by _id
    const eventType = await Type.findById(type);

    if (!eventType) {
      return res.status(404).json({ message: "Event type not found" });
    }
    // Return the eventType details
    res.json({ eventType });
    console.log("event type name:", eventType.eventType);
  } catch (error) {
    res.status(500).json({ message: "Error fetching event type", error });
  }
});

// Create Events
router.post(`/`, uploadOptions.array("images", 10), async (req, res) => {
  console.log("Register Request Body:", req.body);

  const files = req.files;
  if (!files || files.length === 0)
    return res.status(400).send("No images in the request");
  try {
    // Upload images to Cloudinary and get the URLs
    const uploadPromises = files.map((file) => {
      return new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ resource_type: "image" }, (error, result) => {
            if (error) {
              reject(error); // Reject if there's an error
            } else {
              resolve(result.secure_url); // Resolve with the image URL
            }
          })
          .end(file.buffer); // Ensure to call .end() to initiate the upload
      });
    });

    const imageUrls = await Promise.all(uploadPromises);

    const event = new Event({
      name: req.body.name,
      description: req.body.description,
      type: req.body.type,
      organization: req.body.organization,
      department: req.body.department,
      dateStart: req.body.dateStart,
      dateEnd: req.body.dateEnd,
      location: req.body.location,
      images: imageUrls,
      userId: req.body.userID,
    });

    const savedEvent = await event.save();
    if (!savedEvent) {
      return res.status(500).send("The event cannot be created");
    }

    res.send(savedEvent);
  } catch (error) {
    console.error("Error processing the event:", error);
    res.status(500).send("Error processing the event: " + error.message);
  }
});

// Create Web Events
router.post(`/create`, uploadOptions.array("images", 10), async (req, res) => {
  console.log("Register Request Body:", req.body);

  const eventType = Array.isArray(req.body.type)
    ? req.body.type[0]
    : req.body.type;

  try {
    const typeDoc = await Type.findOne({ eventType: eventType });
    if (!typeDoc) {
      return res.status(400).send("Invalid event type");
    }

    const typeObjectId = typeDoc._id;

    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).send("No images uploaded in the request");
    }

    const uploadPromises = files.map((file) => {
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
    });

    const imageUrls = await Promise.all(uploadPromises);

    const event = new Event({
      name: req.body.name,
      description: req.body.description,
      type: typeObjectId,
      organization: req.body.organization,
      secondOrganization: req.body.secondOrganization || null,
      department: req.body.department,
      dateStart: req.body.dateStart,
      dateEnd: req.body.dateEnd,
      location: req.body.location,
      capacity: parseInt(req.body.capacity), // Ensure this is a number
      remainingCapacity: parseInt(req.body.capacity), // Match capacity initially
      images: imageUrls,
      userId: req.body.userId,
    });

    const savedEvent = await event.save();
    if (!savedEvent) {
      return res.status(500).send("The event cannot be created");
    }

    res.send(savedEvent);
  } catch (error) {
    console.error("Error processing the event:", error);
    res.status(500).send("Error processing the event: " + error.message);
  }
});

// Update Web Event
router.put("/:id", uploadOptions.array("images", 10), async (req, res) => {
  console.log("Update Request Body:", req.body);

  const event = await Event.findById(req.params.id);
  if (!event) return res.status(400).send("Invalid Event!");

  console.log("Event found:", event._id);

  // Check if the event type exists in the Type collection
  const eventType = await Type.findById(req.body.type); // Use findById instead of findOne
  if (!eventType) {
    return res.status(400).send("Invalid event type");
  }

  const files = req.files;
  const existingImages = Array.isArray(req.body.existingImages)
    ? req.body.existingImages
    : req.body.existingImages
    ? [req.body.existingImages]
    : [];

  try {
    let images = [...existingImages];

    if (files && files.length > 0) {
      // Upload new images to Cloudinary and get the URLs
      const imagePromises = files.map((file) => {
        return new Promise((resolve, reject) => {
          let cld_upload_stream = cloudinary.uploader.upload_stream(
            { folder: "events" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result.secure_url);
            }
          );

          streamifier.createReadStream(file.buffer).pipe(cld_upload_stream);
        });
      });

      const newImages = await Promise.all(imagePromises);
      images = [...images, ...newImages];
    }

    // Remove old images from Cloudinary (if you want to implement image removal logic)
    if (req.body.removeImages && Array.isArray(req.body.removeImages)) {
      const removePromises = req.body.removeImages.map((imageUrl) => {
        return cloudinary.uploader.destroy(
          imageUrl.split("/").pop().split(".")[0]
        ); // Extract public ID and delete
      });
      await Promise.all(removePromises);
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name,
        description: req.body.description,
        type: eventType._id, // Use ObjectId for type
        dateStart: req.body.dateStart,
        dateEnd: req.body.dateEnd,
        location: req.body.location,
        capacity: parseInt(req.body.capacity), // Ensure this is a number
        remainingCapacity: parseInt(req.body.capacity), // Match capacity initially
        images: images, // Save both existing and new Cloudinary URLs
        userId: req.body.userId,
      },
      { new: true }
    );

    if (!updatedEvent)
      return res.status(400).send("The event cannot be updated!");

    res.json({
      message: "Event updated successfully",
      updatedEvent,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error updating event: " + error.message);
  }
});

// Backend API endpoint for fetching events by organization
router.get("/adminevents", async (req, res) => {
  try {
    const { organization } = req.query;
    console.log("anong org:", organization);

    if (!organization) {
      return res.status(400).json({ message: "Organization is required" });
    }

    // Step 1: Get all events for the organization
    const events = await Event.find({ organization }).lean();

    // Step 2: Extract valid ObjectId references
    const locationIds = events
      .filter((e) => mongoose.Types.ObjectId.isValid(e.location))
      .map((e) => e.location);

    const typeIds = events
      .filter((e) => mongoose.Types.ObjectId.isValid(e.type))
      .map((e) => e.type);

    // Step 3: Fetch related documents
    const locations = await Location.find({ _id: { $in: locationIds } }).lean();
    const types = await Type.find({ _id: { $in: typeIds } }).lean();

    // Step 4: Create maps for quick lookup
    const locationMap = {};
    locations.forEach((loc) => {
      locationMap[loc._id.toString()] = loc.name;
    });

    const typeMap = {};
    types.forEach((type) => {
      typeMap[type._id.toString()] =
        type.eventType || type.name || "Unknown Type";
    });

    // Step 5: Replace ObjectIds with readable values
    const finalEvents = events.map((event) => {
      if (mongoose.Types.ObjectId.isValid(event.location)) {
        event.location =
          locationMap[event.location.toString()] || "Unknown Location";
      }

      if (mongoose.Types.ObjectId.isValid(event.type)) {
        event.type = {
          eventType: typeMap[event.type.toString()] || "Unknown Type",
        };
      }

      return event;
    });

    console.log("events ni org:", finalEvents);
    res.json(finalEvents);
  } catch (error) {
    console.error("Error in /adminevents:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Backend API endpoint for getting the total number of events per organization
router.get("/event-count", async (req, res) => {
  try {
    const eventCounts = await Event.aggregate([
      {
        $group: {
          _id: "$organization", // Group by organization
          totalEvents: { $sum: 1 }, // Count the number of events per organization
        },
      },
    ]);

    res.json(eventCounts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// router.put('/:id', uploadOptions.array('images', 10), async (req, res) => {
//     console.log(req.body);
//     if (!mongoose.isValidObjectId(req.params.id)) {
//         return res.status(400).send('Invalid Brand Id');
//     }

//     const brand = await Brand.findById(req.params.id);
//     if (!brand) return res.status(400).send('Invalid Product!');

//     let images = brand.images; // Existing images

//     const files = req.files;
//     if (files && files.length > 0) {
//         // If new images are uploaded, add them to the existing images array
//         const basePath = `${req.protocol}://${req.get('host')}/public/uploads/`;
//         const newImages = files.map(file => `${basePath}${file.filename}`);
//         images = images.concat(newImages);
//     }

//     const updatedBrand = await Brand.findByIdAndUpdate(
//         req.params.id,
//         {
//             name: req.body.name,
//             description: req.body.description,
//             images: images // Update images with the combined array of existing and new images
//         },
//         { new: true }
//     );

//     if (!updatedBrand) return res.status(500).send('the brand cannot be updated!');

//     res.send(updatedBrand);
// });

//Event Update
// router.put('/:id', async (req, res) => {
//     if (!mongoose.isValidObjectId(req.params.id)) {
//         return res.status(400).send('Invalid Event ID');
//     }

//     try {
//         const updatedEvent = await Event.findByIdAndUpdate(
//             req.params.id,
//             {
//                 name: req.body.name,
//                 description: req.body.description,
//                 dateStart: req.body.dateStart,
//                 dateEnd: req.body.dateEnd,
//                 images: req.body.images
//             },
//             { new: true }
//         );

//         if (!updatedEvent) {
//             return res.status(404).json({ success: false, message: 'Event not found' });
//         }

//         res.status(200).json(updatedEvent);
//     } catch (error) {
//         res.status(500).json({ success: false, error: error.message });
//     }
// });

// Delete Event
// router.delete('/:id', (req, res)=>{
//     Event.findByIdAndRemove(req.params.id).then(event =>{
//         if(event) {
//             return res.status(200).json({success: true, message: 'the event is deleted!'})
//         } else {
//             return res.status(404).json({success: false , message: "event not found!"})
//         }
//     }).catch(err=>{
//        return res.status(500).json({success: false, error: err})
//     })
// })

// Archive Event
router.put("/archive/:id", async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { isArchived: true },
      { new: true }
    );

    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found!" });
    }

    return res
      .status(200)
      .json({ success: true, message: "The event is archived!", event });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Unarchive Event
router.put("/unarchive/:id", async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { isArchived: false },
      { new: true }
    );

    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found!" });
    }

    return res
      .status(200)
      .json({ success: true, message: "The event is unarchived!", event });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Event create feedback (di ata to ginamit)
router.post("/:id/feedback", async (req, res) => {
  const eventId = req.params.id;

  if (!mongoose.isValidObjectId(eventId)) {
    return res.status(400).send("Invalid Event ID");
  }
  const event = await Event.findById(eventId);
  if (!event) {
    return res.status(404).send("Event not found");
  }
  const feedback = {
    user: req.body.user,
    comment: req.body.comment,
  };

  event.feedback.push(feedback);

  try {
    const updatedEvent = await event.save();
    res.status(200).json(updatedEvent);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create Feedback (di ata to ginamit)
router.post("/feedback", async (req, res) => {
  try {
    const { userId, eventName, feedback, rating } = req.body;
    const newRating = new Rating({ userId, eventName, feedback, rating });
    const savedRating = await newRating.save();
    res
      .status(201)
      .json(savedRating, { message: "Feedback submitted successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// (di to ginamit)
// router.put('/gallery-images/:id', uploadOptions.array('images', 10), async (req, res) => {
//     if (!mongoose.isValidObjectId(req.params.id)) {
//         return res.status(400).send('Invalid Product Id');
//     }
//     const files = req.files;
//     let imagesPaths = [];
//     const basePath = `${req.protocol}://${req.get('host')}/public/uploads/`;

//     if (files) {
//         files.map((file) => {
//             imagesPaths.push(`${basePath}${file.filename}`);
//         });
//     }

//     const brand = await Brand.findByIdAndUpdate(
//         req.params.id,
//         {
//             images: imagesPaths
//         },
//         { new: true }
//     );

//     if (!brand) return res.status(500).send('the gallery cannot be updated!');

//     res.send(brand);
// });

// Open or Close Event's Questionnaire
router.put("/toggle-feedback-survey/:eventId", async (req, res) => {
  try {
    const eventId = req.params.eventId;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    event.isFeedbackSurveyOpen = !event.isFeedbackSurveyOpen;

    await event.save();
    res
      .status(200)
      .json({ message: "Feedback & survey status updated", event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get Specific Event (di ata to ginamit)
router.get("/:eventId", async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json(event);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});
// // GET all web events
// router.get('/all', async (req, res) => {
//   try {
//     const events = await Event.find().sort({ dateStart: -1 });
//     res.status(200).json({
//       success: true,
//       count: events.length,
//       data: events
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: 'Bakit Ayaw'
//     });
//   }
// });

// Get all calendar events
router.get("/event/events", async (req, res) => {
  try {
    const events = await Event.find({}, "name dateStart dateEnd"); // Fetch event name and dates
    res.json(events);
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// // Comment on
// router.post('/:eventId/comments', async (req, res) => {
//     const { text } = req.body;
//     const userId = req.body.userId; // Assuming you pass the user ID in the request body

//     if (!mongoose.isValidObjectId(req.params.eventId) || !mongoose.isValidObjectId(userId)) {
//         return res.status(400).send('Invalid Event or User ID');
//     }

//     try {
//         const event = await Event.findById(req.params.eventId);
//         if (!event) {
//             return res.status(404).send('Event not found');
//         }

//         event.comments.push({ user: userId, text });
//         await event.save();

//         res.status(201).json({ message: 'Comment added successfully', comments: event.comments });
//     } catch (error) {
//         res.status(500).json({ error: 'Error posting comment', details: error.message });
//     }
// });

// Kunin ang comments
router.get("/:eventId/comments", async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId).populate(
      "comments.user",
      "name surname image" // Include name, surname, and image
    );

    if (!event) return res.status(404).send("Event not found");

    res.json(event.comments);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error retrieving comments", details: error.message });
  }
});

// Get overall sentiment for an event
router.get("/:eventId/sentiment", async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const sentimentCounts = event.comments.reduce((acc, comment) => {
      acc[comment.sentiment] = (acc[comment.sentiment] || 0) + 1;
      return acc;
    }, {});

    res.json({ eventId: req.params.eventId, sentimentCounts });
  } catch (error) {
    res.status(500).json({
      error: "Error retrieving sentiment data",
      details: error.message,
    });
  }
});

// Route to handle posting comments
const MAX_COMMENT_INTERVAL = 20 * 1000;
const SPAM_THRESHOLD = 3;
const COOLDOWN_PERIODS = {
  mild: 1 * 60 * 1000,
  moderate: 5 * 60 * 1000,
  severe: 10 * 60 * 1000,
};

const translateToEnglish = (text) => {
  return new Promise((resolve, reject) => {
    const options = {
      method: "POST",
      hostname: "deep-translate1.p.rapidapi.com",
      path: "/language/translate/v2",
      headers: {
        "x-rapidapi-key": "399f60b0a8msha51621c4a21e43dp1cae58jsne35e1321da38",
        "x-rapidapi-host": "deep-translate1.p.rapidapi.com",
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => {
        chunks.push(chunk);
      });

      res.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        const result = JSON.parse(body);
        console.log("Orig Text", text);
        //   console.log("ano to ulit: ", result)
        const translatedText = result.data.translations.translatedText[0];
        console.log("Translated Text: ", translatedText);
        resolve(translatedText);
      });
    });

    req.on("error", (err) => reject(err));

    req.write(
      JSON.stringify({
        q: text,
        source: "auto",
        target: "en",
      })
    );
    req.end();
  });
};

// const analyzeSentiment = (text) => {
//   return new Promise((resolve, reject) => {
//     const options = {
//       method: "POST",
//       hostname: "sentiment-analysis9.p.rapidapi.com",
//       path: "/sentiment",
//       headers: {
//         "x-rapidapi-key": "98387a8ec0mshfe04690e0a2f5edp121879jsn8607d7ff8c1b",
//         "x-rapidapi-host": "sentiment-analysis9.p.rapidapi.com",
//         "Content-Type": "application/json",
//         Accept: "application/json",
//       },
//     };

//     const req = http.request(options, (res) => {
//       const chunks = [];

//       res.on("data", (chunk) => {
//         chunks.push(chunk);
//       });

//       res.on("end", () => {
//         const body = Buffer.concat(chunks).toString();
//         resolve(JSON.parse(body));
//       });
//     });

//     req.on("error", (err) => reject(err));

//     req.write(
//       JSON.stringify([
//         {
//           id: "1",
//           language: "en",
//           text: text,
//         },
//       ])
//     );
//     req.end();
//   });
// };

// const analyzeSentiment = (translatedCommentText) => {
//   return new Promise((resolve, reject) => {
//     const options = {
//       method: 'POST',
//       hostname: 'sentimentsnap-api3.p.rapidapi.com',
//       port: null,
//       path: '/v1/sentiment',
//       headers: {
//         'x-rapidapi-key': '98387a8ec0mshfe04690e0a2f5edp121879jsn8607d7ff8c1b',
//         'x-rapidapi-host': 'sentimentsnap-api3.p.rapidapi.com',
//         'Content-Type': 'application/json'
//       }
//     };

//     const req = http.request(options, (res) => {
//       let data = '';

//       res.on('data', (chunk) => {
//         data += chunk;
//       });

//       res.on('end', () => {
//         try {
//           const jsonResponse = JSON.parse(data);
//           console.log("Sentiment API Response:", jsonResponse);
//           resolve(jsonResponse);
//         } catch (error) {
//           reject(`Error parsing sentiment API response: ${error.message}`);
//         }
//       });
//     });

//     req.on('error', (error) => reject(`HTTP request error: ${error.message}`));

//     req.write(JSON.stringify({ text: translatedCommentText }));
//     req.end();
//   });
// };

// const analyzeSentiment = (translatedCommentText) => {
//   return new Promise((resolve, reject) => {
//     const options = {
//       method: 'POST',
//       hostname: 'sentiment-analysis9.p.rapidapi.com',
//       port: null,
//       path: '/sentiment',
//       headers: {
//         'x-rapidapi-key': '98387a8ec0mshfe04690e0a2f5edp121879jsn8607d7ff8c1b',
//         'x-rapidapi-host': 'sentiment-analysis9.p.rapidapi.com',
//         'Content-Type': 'application/json',
//         Accept: 'application/json'
//       }
//     };

//     const req = http.request(options, function (res) {
//       const chunks = [];

//       res.on('data', function (chunk) {
//         chunks.push(chunk);
//       });

//       res.on('end', function () {
//         const body = Buffer.concat(chunks);
//         console.log(body.toString());
//       });
//     });

//     req.write(JSON.stringify([
//       {
//         id: '1',
//         language: 'en',
//         text: translatedCommentText,
//       }
//     ]));
//     req.end();
//   });
// };

const analyzeSentiment = (translatedCommentText) => {
  return new Promise((resolve, reject) => {
    const options = {
      method: "POST",
      hostname: "sentiment-analysis9.p.rapidapi.com",
      port: null,
      path: "/sentiment",
      headers: {
        "x-rapidapi-key": "98387a8ec0mshfe04690e0a2f5edp121879jsn8607d7ff8c1b",
        "x-rapidapi-host": "sentiment-analysis9.p.rapidapi.com",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    const req = http.request(options, function (res) {
      const chunks = [];

      res.on("data", function (chunk) {
        chunks.push(chunk);
      });

      res.on("end", function () {
        const body = Buffer.concat(chunks);
        try {
          const json = JSON.parse(body.toString());
          // ✅ Resolve the prediction value directly
          const prediction = json[0]?.predictions[0]?.prediction || "neutral";
          resolve({ sentiment: prediction });
        } catch (error) {
          reject("Failed to parse sentiment API response");
        }
      });
    });

    req.on("error", (e) => {
      reject(`Error with sentiment API: ${e.message}`);
    });

    req.write(
      JSON.stringify([
        {
          id: "1",
          language: "en",
          text: translatedCommentText,
        },
      ])
    );
    req.end();
  });
};

// Route to handle posting comments
// router.post('/:eventId/comments', async (req, res) => {
//   const { text, userId } = req.body;

//   const translatedCommentText = await translateToEnglish(text);
//     console.log("Translated Post Text:", translatedCommentText);

//     const sentimentResult = await analyzeSentiment(translatedCommentText);
//     console.log("Sentiment API Result:", sentimentResult);

//     const sentiment = sentimentResult.sentiment;

//     if (!sentiment || sentiment.length === 0) {
//       throw new Error("No sentiment found in sentiment analysis result");
//     }
//     const formattedSentiment = sentiment.toLowerCase();
//     console.log("Formatted Sentiment:", formattedSentiment);

//   if (!mongoose.isValidObjectId(req.params.eventId) || !mongoose.isValidObjectId(userId)) {
//       return res.status(400).send('Invalid Event or User ID');
//   }

//   try {
//       const event = await Event.findById(req.params.eventId);
//       if (!event) {
//           return res.status(404).send('Event not found');
//       }

//       const user = await User.findById(userId);
//       if (!user) {
//           return res.status(404).send('User not found');
//       }

//       // Check if the user is currently under cooldown
//       const currentTime = new Date();
//       console.log("Current Time", currentTime)

//       if (user.commentCooldown && new Date(user.commentCooldown) < currentTime) {
//         user.warningCount = 0;
//         user.commentCooldown = null;
//         await user.save();
//       }

//       if (user.commentCooldown && currentTime < new Date(user.commentCooldown)) {
//           const timeRemaining = Math.ceil((new Date(user.commentCooldown) - currentTime) / 1000 / 60);
//           return res.status(400).send(`You are currently under cooldown. Please wait ${timeRemaining} minutes before commenting again.`);
//       }

//       // Find the user's last few comments
//       const userComments = event.comments.filter(comment => comment.user.toString() === userId);
//       const lastComment = userComments[userComments.length - 1];

//       if (lastComment && (currentTime - new Date(lastComment.createdAt) < MAX_COMMENT_INTERVAL)) {
//           // Increment the warning count
//           user.warningCount += 1;
//           console.log("Warning Count:", user.warningCount);

//           // If the warning count exceeds the threshold, apply cooldown
//           if (user.warningCount >= 2) {
//               const cooldownTime = COOLDOWN_PERIODS.mild;
//               user.commentCooldown = new Date(Date.now() + cooldownTime);
//               await user.save();

//               return res.status(400).send(`You are commenting too quickly. You are now blocked from commenting for ${cooldownTime / (1000 * 60)} minutes.`);
//           }

//           await user.save();
//           return res.status(400).send('You are commenting too quickly. Please wait a moment before posting again.');
//       }

//       // Check if user is spamming (same comment repeatedly)
//       const recentComments = userComments.filter(comment => (currentTime - new Date(comment.createdAt)) < MAX_COMMENT_INTERVAL);
//       const similarComments = recentComments.filter(comment => comment.text.trim() === text.trim());

//       if (similarComments.length >= SPAM_THRESHOLD) {
//           // Flag user for spamming and apply a cooldown period based on intensity
//           const cooldownTime = determineCooldown(recentComments.length);
//           await applyCooldown(userId, cooldownTime);

//           return res.status(400).send(`You are spamming comments. You are blocked from commenting for ${cooldownTime / (1000 * 60)} minutes.`);
//       }

//       // Add the new comment to the event
//       event.comments.push({ user: userId, text, sentiment: formattedSentiment,
//       });
//       await event.save();

//       res.status(201).json({ message: 'Comment added successfully', comments: event.comments });
//   } catch (error) {
//       // Instead of logging the error to console, just send a generic error message to the client
//       res.status(500).json({ error: 'Error posting comment. Please try again later.' });
//   }
// });

// Route to handle posting comments
router.post("/:eventId/comments", async (req, res) => {
  const { text, userId } = req.body;

  const translatedCommentText = await translateToEnglish(text);
  console.log("Translated Post Text:", translatedCommentText);

  const sentimentResult = await analyzeSentiment(translatedCommentText);
  console.log("Sentiment API Result:", sentimentResult);

  const sentiment = sentimentResult.sentiment;

  if (!sentiment || sentiment.length === 0) {
    throw new Error("No sentiment found in sentiment analysis result");
  }
  const formattedSentiment = sentiment.toLowerCase();
  console.log("Formatted Sentiment:", formattedSentiment);

  if (
    !mongoose.isValidObjectId(req.params.eventId) ||
    !mongoose.isValidObjectId(userId)
  ) {
    return res.status(400).send("Invalid Event or User ID");
  }

  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).send("Event not found");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    // Check if the user is currently under cooldown
    const currentTime = new Date();
    console.log("Current Time", currentTime);

    if (user.commentCooldown && new Date(user.commentCooldown) < currentTime) {
      user.warningCount = 0;
      user.commentCooldown = null;
      await user.save();
    }

    if (user.commentCooldown && currentTime < new Date(user.commentCooldown)) {
      const timeRemaining = Math.ceil(
        (new Date(user.commentCooldown) - currentTime) / 1000 / 60
      );
      return res
        .status(400)
        .send(
          `You are currently under cooldown. Please wait ${timeRemaining} minutes before commenting again.`
        );
    }

    // Find the user's last few comments
    const userComments = event.comments.filter(
      (comment) => comment.user.toString() === userId
    );
    const lastComment = userComments[userComments.length - 1];

    if (
      lastComment &&
      currentTime - new Date(lastComment.createdAt) < MAX_COMMENT_INTERVAL
    ) {
      // Increment the warning count
      user.warningCount += 1;
      console.log("Warning Count:", user.warningCount);

      // If the warning count exceeds the threshold, apply cooldown
      if (user.warningCount >= 2) {
        const cooldownTime = COOLDOWN_PERIODS.mild;
        user.commentCooldown = new Date(Date.now() + cooldownTime);
        await user.save();

        return res
          .status(400)
          .send(
            `You are commenting too quickly. You are now blocked from commenting for ${
              cooldownTime / (1000 * 60)
            } minutes.`
          );
      }

      await user.save();
      return res
        .status(400)
        .send(
          "You are commenting too quickly. Please wait a moment before posting again."
        );
    }

    // Check if user is spamming (same comment repeatedly)
    const recentComments = userComments.filter(
      (comment) =>
        currentTime - new Date(comment.createdAt) < MAX_COMMENT_INTERVAL
    );
    const similarComments = recentComments.filter(
      (comment) => comment.text.trim() === text.trim()
    );

    if (similarComments.length >= SPAM_THRESHOLD) {
      // Flag user for spamming and apply a cooldown period based on intensity
      const cooldownTime = determineCooldown(recentComments.length);
      await applyCooldown(userId, cooldownTime);

      return res
        .status(400)
        .send(
          `You are spamming comments. You are blocked from commenting for ${
            cooldownTime / (1000 * 60)
          } minutes.`
        );
    }

    // Add the new comment to the event
    event.comments.push({ user: userId, text, sentiment: formattedSentiment });
    await event.save();

    res.status(201).json({
      message: "Comment added successfully",
      comments: event.comments,
    });
  } catch (error) {
    // Instead of logging the error to console, just send a generic error message to the client
    res
      .status(500)
      .json({ error: "Error posting comment. Please try again later." });
  }
});

// Determine cooldown period based on the number of recent comments
const determineCooldown = (numOfRecentComments) => {
  if (numOfRecentComments >= 10) {
    return COOLDOWN_PERIODS.severe; // 6 hours for severe spamming
  } else if (numOfRecentComments >= 5) {
    return COOLDOWN_PERIODS.moderate; // 3 hours for moderate spamming
  } else {
    return COOLDOWN_PERIODS.mild; // 1 hour for mild spamming
  }
};

// Helper function to apply cooldown period to the user
const applyCooldown = async (userId, cooldownTime) => {
  const user = await User.findById(userId);
  user.commentCooldown = new Date(Date.now() + cooldownTime); // Set cooldown expiration
  user.warningCount = 0; // Reset warning count after applying cooldown
  await user.save();
};

// Get All Upcoming Events
router.get("/events/upcoming", async (req, res) => {
  try {
    const currentDate = new Date();
    console.log("Current Date:", currentDate);

    const events = await Event.find({ dateStart: { $gte: currentDate } })
      .populate("type", "eventType")
      .lean();

    console.log("Upcoming events found:", events);

    if (!events || events.length === 0) {
      return res.status(200).json({ message: "No upcoming events found." });
    }
    res.json(events);
  } catch (error) {
    console.error("Error fetching upcoming events:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

// Route to fetch events based on organization
router.get("/events/:organization", async (req, res) => {
  try {
    const organizationName = req.params.organization;
    console.log(`Fetching events for organization: ${organizationName}`); // Log the organization name

    // Find events by organization name
    const events = await Event.find({ organization: organizationName });

    if (!events || events.length === 0) {
      console.log(`No events found for organization: ${organizationName}`); // Log if no events found
      return res
        .status(404)
        .json({ message: "No events found for this organization" });
    }

    res.status(200).json(events);
  } catch (error) {
    console.error(
      `Error fetching events for organization: ${organizationName}`,
      error
    ); // Log the error
    res.status(500).json({ message: "Server error", error });
  }
});

router.post("/check-conflict", async (req, res) => {
  try {
    const { dateStart, dateEnd, location } = req.body;

    console.log("req body", dateStart, dateEnd, location);
    if (!dateStart || !dateEnd || !location) {
      return res.status(400).json({
        message: "Start date, end date, and location are required.",
      });
    }

    const start = new Date(dateStart);
    const end = new Date(dateEnd);

    const conflict = await Event.findOne({
      isArchived: false,
      location: location,
      dateStart: { $lt: end },
      dateEnd: { $gt: start },
    });

    console.log("conflict ngani", conflict);

    if (conflict) {
      return res.status(200).json({
        conflict: true,
        message:
          "There is a scheduling conflict with another event at the same location.",
        conflictingEvent: conflict,
      });
    }

    return res.status(200).json({ conflict: false });
  } catch (err) {
    console.error("Error checking conflict:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
});

router.put("/reopen/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const { isReopened } = req.body;

    if (typeof isReopened !== "boolean") {
      return res
        .status(400)
        .json({ message: "isReopened must be a boolean (true or false)." });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    event.isReopened = isReopened;
    await event.save();

    res.status(200).json({
      message: `Event "${event.name}" successfully ${
        isReopened ? "reopened" : "closed"
      }.`,
      updatedEvent: event,
    });
  } catch (error) {
    console.error("❌ Error updating event reopen status:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;
