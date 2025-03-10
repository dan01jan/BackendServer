const express = require('express');
const { Event } = require('../models/event');
const { User } = require('../models/user');
const { Type } = require('../models/type');
const { Organization } = require('../models/type');
const router = express.Router();
const mongoose = require('mongoose');
const cloudinary = require('../utils/cloudinary');
const uploadOptions = require('../utils/multer');
const streamifier = require('streamifier');
const { captureRejectionSymbol } = require('nodemailer/lib/xoauth2');

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
        return res.status(200).json({ message: 'No events found for the given type' });
      }

      events = await Event.find({ type: eventTypeId }).populate('type');
    } else {
      // Fetch all events and populate the type
      events = await Event.find().populate('type');
    }

    if (events.length === 0) {
      return res.status(200).json({ message: 'No events found' });
    }

    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/events', async (req, res) => {
  try {
      const events = await Event.find().populate('type').populate('userId', 'name');
      res.json(events);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching events', error });
  }
});

router.get('/getEventTypeById/:type', async (req, res) => {
  const { type } = req.params; // The _id of the eventType to search for
  try {
    // Search for the eventType by _id
    const eventType = await Type.findById(type);
    
    if (!eventType) {
      return res.status(404).json({ message: "Event type not found" });
    }
    // Return the eventType details
    res.json({ eventType });
    console.log("event type name:", eventType.eventType)
  } catch (error) {
    res.status(500).json({ message: "Error fetching event type", error });
  }
});

// Create Events
router.post(`/`, uploadOptions.array('images', 10), async (req, res) => { 
    console.log('Register Request Body:', req.body);    

    const files = req.files;
    if (!files || files.length === 0) return res.status(400).send('No images in the request');
    try {
        // Upload images to Cloudinary and get the URLs
        const uploadPromises = files.map(file => {
          return new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              { resource_type: 'image' },
              (error, result) => {
                if (error) {
                  reject(error);  // Reject if there's an error
                } else {
                  resolve(result.secure_url);  // Resolve with the image URL
                }
              }
            ).end(file.buffer);  // Ensure to call .end() to initiate the upload
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
          return res.status(500).send('The event cannot be created');
        }
    
        res.send(savedEvent);
    
      } catch (error) {
        console.error('Error processing the event:', error);
        res.status(500).send('Error processing the event: ' + error.message);
      }
});

// Create Web Events
router.post(`/create`, uploadOptions.array('images', 10), async (req, res) => {
  console.log('Register Request Body:', req.body);

  // Ensure the type is a valid string and find the corresponding ObjectId in the Type collection
  const eventType = Array.isArray(req.body.type) ? req.body.type[0] : req.body.type;

  try {
      // Find the corresponding Type document using the eventType (like "Academic events")
      const typeDoc = await Type.findOne({ eventType: eventType });
      if (!typeDoc) {
          return res.status(400).send('Invalid event type');
      }

      const typeObjectId = typeDoc._id;  // This will be the ObjectId of the selected type

      // Check if files are included in the request
      const files = req.files;
      if (!files || files.length === 0) {
          return res.status(400).send('No images uploaded in the request');
      }

      // Upload images to Cloudinary and get the URLs
      const uploadPromises = files.map(file => {
          return new Promise((resolve, reject) => {
              cloudinary.uploader.upload_stream(
                  { resource_type: 'image' },
                  (error, result) => {
                      if (error) {
                          reject(error);  // Reject if there's an error
                      } else {
                          resolve(result.secure_url);  // Resolve with the image URL
                      }
                  }
              ).end(file.buffer);  // Ensure to call .end() to initiate the upload
          });
      });

      // Wait for all images to upload and get their URLs
      const imageUrls = await Promise.all(uploadPromises);

      // Create and save the event
      const event = new Event({
          name: req.body.name,
          description: req.body.description,
          type: typeObjectId,  // Use the correct ObjectId for the type
          organization: req.body.organization,
          department: req.body.department,
          dateStart: req.body.dateStart,
          dateEnd: req.body.dateEnd,
          location: req.body.location,
          images: imageUrls,  // Store the image URLs
          userId: req.body.userId,
      });

      const savedEvent = await event.save();
      if (!savedEvent) {
          return res.status(500).send('The event cannot be created');
      }

      res.send(savedEvent);

  } catch (error) {
      console.error('Error processing the event:', error);
      res.status(500).send('Error processing the event: ' + error.message);
  }
});

// Update Web Event
router.put('/:id', uploadOptions.array('images', 10), async (req, res) => {
  console.log('Update Request Body:', req.body);

  const event = await Event.findById(req.params.id);
  if (!event) return res.status(400).send('Invalid Event!');

  console.log("Event found:", event._id);

  // Check if the event type exists in the Type collection
  const eventType = await Type.findById(req.body.type); // Use findById instead of findOne
if (!eventType) {
    return res.status(400).send('Invalid event type');
}

  const files = req.files;
  const existingImages = Array.isArray(req.body.existingImages) 
      ? req.body.existingImages 
      : (req.body.existingImages ? [req.body.existingImages] : []);

  try {
      let images = [...existingImages];

      if (files && files.length > 0) {
          // Upload new images to Cloudinary and get the URLs
          const imagePromises = files.map((file) => {
              return new Promise((resolve, reject) => {
                  let cld_upload_stream = cloudinary.uploader.upload_stream(
                      { folder: 'events' },
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
              return cloudinary.uploader.destroy(imageUrl.split('/').pop().split('.')[0]); // Extract public ID and delete
          });
          await Promise.all(removePromises);
      }

      const updatedEvent = await Event.findByIdAndUpdate(
          req.params.id,
          {
              name: req.body.name,
              description: req.body.description,
              type: eventType._id,  // Use ObjectId for type
              dateStart: req.body.dateStart,
              dateEnd: req.body.dateEnd,
              location: req.body.location,
              images: images,  // Save both existing and new Cloudinary URLs
              userId: req.body.userId,
          },
          { new: true }
      );

      if (!updatedEvent) return res.status(400).send('The event cannot be updated!');

      res.json({
          message: 'Event updated successfully',
          updatedEvent,
      });
  } catch (error) {
      console.error(error);
      res.status(500).send('Error updating event: ' + error.message);
  }
});

// Backend API endpoint for fetching events by organization
router.get("/adminevents", async (req, res) => {
  try {
    const { organization } = req.query;
    console.log('anong org:',organization)
    if (!organization) {
      return res.status(400).json({ message: "Organization is required" });
    }

    // Fetch events based on the organization and populate the 'type' field
    const events = await Event.find({ organization: organization }) // Use 'organization' instead of 'organizationName'
      .populate('type', 'eventType') // Populate the 'type' field, selecting only the 'eventType'
      .lean(); // Use lean() for better performance if you don't need Mongoose document methods

    res.json(events);
    console.log("events ni org:", events);
  } catch (error) {
    console.error(error);
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
router.delete('/:id', (req, res)=>{
    Event.findByIdAndRemove(req.params.id).then(event =>{
        if(event) {
            return res.status(200).json({success: true, message: 'the event is deleted!'})
        } else {
            return res.status(404).json({success: false , message: "event not found!"})
        }
    }).catch(err=>{
       return res.status(500).json({success: false, error: err}) 
    })
})


// Event create feedback (di ata to ginamit)
router.post('/:id/feedback', async (req, res) => {
    const eventId = req.params.id;

    if (!mongoose.isValidObjectId(eventId)) {
        return res.status(400).send('Invalid Event ID');
    }
    const event = await Event.findById(eventId);
    if (!event) {
        return res.status(404).send('Event not found');
    }
    const feedback = {
        user: req.body.user,
        comment: req.body.comment
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
router.post('/feedback', async (req, res) => {
    try {
        const { userId, eventName, feedback, rating } = req.body;
        const newRating = new Rating({ userId, eventName, feedback, rating});
        const savedRating = await newRating.save();
        res.status(201).json(savedRating, { message: "Feedback submitted successfully!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
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
router.put('/toggle-feedback-survey/:eventId', async (req, res) => {
    try {
      const eventId = req.params.eventId;
  
      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({ message: 'Event not found' });
      }
  
      event.isFeedbackSurveyOpen = !event.isFeedbackSurveyOpen;
  
      await event.save();
      res.status(200).json({ message: 'Feedback & survey status updated', event });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  });

// Get Specific Event (di ata to ginamit)
router.get('/:eventId', async (req, res) => {
    try {
        const eventId = req.params.eventId;
        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }
        res.json(event);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
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
router.get('/event/events', async (req, res) => {
  try {
    const events = await Event.find({}, 'name dateStart dateEnd'); // Fetch event name and dates
    res.json(events);
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    res.status(500).json({ error: 'Internal Server Error' });
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
router.get('/:eventId/comments', async (req, res) => {
  try {
      const event = await Event.findById(req.params.eventId).populate('comments.user', 'name'); // Populate user names
      if (!event) return res.status(404).send('Event not found');
      res.json(event.comments);
  } catch (error) {
      res.status(500).json({ error: 'Error retrieving comments', details: error.message });
  }
});

// Get overall sentiment for an event
router.get('/:eventId/sentiment', async (req, res) => {
  try {
      const event = await Event.findById(req.params.eventId);
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const sentimentCounts = event.comments.reduce((acc, comment) => {
          acc[comment.sentiment] = (acc[comment.sentiment] || 0) + 1;
          return acc;
      }, {});

      res.json({ eventId: req.params.eventId, sentimentCounts });
  } catch (error) {
      res.status(500).json({ error: 'Error retrieving sentiment data', details: error.message });
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
      method: 'POST',
      hostname: 'deep-translate1.p.rapidapi.com',
      path: '/language/translate/v2',
      headers: {
        'x-rapidapi-key': '399f60b0a8msha51621c4a21e43dp1cae58jsne35e1321da38',
        'x-rapidapi-host': 'deep-translate1.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        const result = JSON.parse(body);
        console.log("Orig Text", text)
      //   console.log("ano to ulit: ", result)
        const translatedText = result.data.translations.translatedText;
        console.log("Translated Text: ", translatedText);
        resolve(translatedText);
      });
    });

    req.on('error', (err) => reject(err));

    req.write(
      JSON.stringify({
        q: text,
        source: 'auto',
        target: 'en',
      })
    );
    req.end();
  });
};

const analyzeSentiment = (text) => {
  return new Promise((resolve, reject) => {
    const options = {
      method: "POST",
      hostname: "sentiment-analysis9.p.rapidapi.com",
      path: "/sentiment",
      headers: {
        "x-rapidapi-key": "98387a8ec0mshfe04690e0a2f5edp121879jsn8607d7ff8c1b",
        "x-rapidapi-host": "sentiment-analysis9.p.rapidapi.com",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    const req = http.request(options, (res) => {
      const chunks = [];

      res.on("data", (chunk) => {
        chunks.push(chunk);
      });

      res.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        resolve(JSON.parse(body));
      });
    });

    req.on("error", (err) => reject(err));

    req.write(
      JSON.stringify([
        {
          id: "1",
          language: "en",
          text: text,
        },
      ])
    );
    req.end();
  });
};


// Route to handle posting comments
router.post('/:eventId/comments', async (req, res) => {
  const { text, userId } = req.body;

  const translatedCommentText = await translateToEnglish(text);
    console.log("Translated Post Text:", translatedCommentText);

    const sentimentResult = await analyzeSentiment(translatedCommentText);
    console.log("Sentiment API Result:", JSON.stringify(sentimentResult, null, 2));

    const predictions = sentimentResult[0]?.predictions;
      if (!predictions || predictions.length === 0) {
        throw new Error("No predictions found in sentiment analysis result");
      }
  
      const prediction = predictions[0]?.prediction || "neutral";
      console.log("Prediction:", prediction);

  if (!mongoose.isValidObjectId(req.params.eventId) || !mongoose.isValidObjectId(userId)) {
      return res.status(400).send('Invalid Event or User ID');
  }

  try {
      const event = await Event.findById(req.params.eventId);
      if (!event) {
          return res.status(404).send('Event not found');
      }

      const user = await User.findById(userId);
      if (!user) {
          return res.status(404).send('User not found');
      }

      // Check if the user is currently under cooldown
      const currentTime = new Date();
      console.log("Current Time", currentTime)

      if (user.commentCooldown && new Date(user.commentCooldown) < currentTime) {
        user.warningCount = 0;
        user.commentCooldown = null;
        await user.save();
      }

      if (user.commentCooldown && currentTime < new Date(user.commentCooldown)) {
          const timeRemaining = Math.ceil((new Date(user.commentCooldown) - currentTime) / 1000 / 60);
          return res.status(400).send(`You are currently under cooldown. Please wait ${timeRemaining} minutes before commenting again.`);
      }

      // Find the user's last few comments
      const userComments = event.comments.filter(comment => comment.user.toString() === userId);
      const lastComment = userComments[userComments.length - 1];

      if (lastComment && (currentTime - new Date(lastComment.createdAt) < MAX_COMMENT_INTERVAL)) {
          // Increment the warning count
          user.warningCount += 1;
          console.log("Warning Count:", user.warningCount);

          // If the warning count exceeds the threshold, apply cooldown
          if (user.warningCount >= 2) {
              const cooldownTime = COOLDOWN_PERIODS.mild;
              user.commentCooldown = new Date(Date.now() + cooldownTime); 
              await user.save();

              return res.status(400).send(`You are commenting too quickly. You are now blocked from commenting for ${cooldownTime / (1000 * 60)} minutes.`);
          }

          await user.save();
          return res.status(400).send('You are commenting too quickly. Please wait a moment before posting again.');
      }

      // Check if user is spamming (same comment repeatedly)
      const recentComments = userComments.filter(comment => (currentTime - new Date(comment.createdAt)) < MAX_COMMENT_INTERVAL);
      const similarComments = recentComments.filter(comment => comment.text.trim() === text.trim());

      if (similarComments.length >= SPAM_THRESHOLD) {
          // Flag user for spamming and apply a cooldown period based on intensity
          const cooldownTime = determineCooldown(recentComments.length);
          await applyCooldown(userId, cooldownTime);

          return res.status(400).send(`You are spamming comments. You are blocked from commenting for ${cooldownTime / (1000 * 60)} minutes.`);
      }

      // Add the new comment to the event
      event.comments.push({ user: userId, text, sentiment: prediction,
      });
      await event.save();

      res.status(201).json({ message: 'Comment added successfully', comments: event.comments });
  } catch (error) {
      // Instead of logging the error to console, just send a generic error message to the client
      res.status(500).json({ error: 'Error posting comment. Please try again later.' });
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

module.exports=router;