const express = require('express');
const { User } = require('../models/user');
const { Post } = require('../models/post');
const router = express.Router();
const mongoose = require('mongoose');
const cloudinary = require('../utils/cloudinary');
const uploadOptions = require('../utils/multer');
const streamifier = require('streamifier');
const http = require("https");



router.get('/', async (req, res) => {
    try {
        const posts = await Post.find().populate('userId', 'name surname image'); // Populate user details
        res.status(200).send(posts);
    } catch (error) {
        res.status(500).send('Error fetching posts: ' + error.message);
    }
});


router.get('/tags', (req, res) => {
    const tags = [
      "General Discussion",
      "Help Needed",
      "Advice",
      "Opinion",
      "News",
      "Event",
      "Feedback",
    ];
    res.json(tags);
  });

router.get('/:postId/comments', async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId).populate('comments.user', 'name'); // Populate user names
        if (!post) return res.status(404).send('Post not found');
        res.json(post.comments);
    } catch (error) {
        res.status(500).json({ error: 'Error retrieving comments', details: error.message });
    }
});

 router.post('/:postId/comments', async (req, res) => {
     const { text } = req.body;
     const postText = text;
     const userId = req.body.userId;
 
    const translatedPostText = await translateToEnglish(postText);
    console.log("Translated Post Text:", translatedPostText);

    const sentimentResult = await analyzeSentiment(translatedPostText);
    console.log("Sentiment API Result:", JSON.stringify(sentimentResult, null, 2));

    const predictions = sentimentResult[0]?.predictions;
      if (!predictions || predictions.length === 0) {
        throw new Error("No predictions found in sentiment analysis result");
      }
  
      const prediction = predictions[0]?.prediction || "neutral";
      console.log("Prediction:", prediction);
     if (!mongoose.isValidObjectId(req.params.postId) || !mongoose.isValidObjectId(userId)) {
         return res.status(400).send('Invalid Event or User ID');
     } 
 
     try {
         const post = await Post.findById(req.params.postId);
         if (!post) {
             return res.status(404).send('Event not found');
         }
 
         post.comments.push({ user: userId, text, sentiment: prediction });
         await post.save();
 
         res.status(201).json({ message: 'Comment added successfully', comments: post.comments });
     } catch (error) {
         res.status(500).json({ error: 'Error posting comment', details: error.message });
     }
 });


 const translateToEnglish = (postText) => {
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
          console.log("Orig Text", postText)
        //   console.log("ano to ulit: ", result)
          const translatedText = result.data.translations.translatedText;
          console.log("Translated Text: ", translatedText);
          resolve(translatedText);
        });
      });
  
      req.on('error', (err) => reject(err));
  
      req.write(
        JSON.stringify({
          q: postText,
          source: 'auto',
          target: 'en',
        })
      );
      req.end();
    });
  };
  
  const analyzeSentiment = (postText) => {
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
            text: postText,
          },
        ])
      );
      req.end();
    });
  };


router.post('/', uploadOptions.array('images', 10), async (req, res) => {
    console.log('Create Post Request Body:', req.body);

    const { userId, tags, postText } = req.body;

    const translatedPostText = await translateToEnglish(postText);
    console.log("Translated Post Text:", translatedPostText);

    const sentimentResult = await analyzeSentiment(translatedPostText);
    console.log("Sentiment API Result:", JSON.stringify(sentimentResult, null, 2));

    const predictions = sentimentResult[0]?.predictions;
      if (!predictions || predictions.length === 0) {
        throw new Error("No predictions found in sentiment analysis result");
      }
  
      const prediction = predictions[0]?.prediction || "neutral";
      console.log("Prediction:", prediction);

    if (typeof tags === "string") {
        try {
            tags = JSON.parse(tags);
        } catch (error) {
            return res.status(400).send("Invalid tags format");
        }
    }

    if (!Array.isArray(tags)) {
        return res.status(400).send("Tags must be an array");
    }

    const allowedTags = ["General Discussion", "Help Needed", "Advice", "Opinion", "News", "Event", "Feedback"];
    const isValidTags = tags.every((tag) => allowedTags.includes(tag));

    if (!isValidTags) {
        return res.status(400).send("Invalid tags provided");
    }

    const files = req.files;
    console.log("may laman", req.files);

    if (!userId || !tags || !postText) {
        return res.status(400).send('Missing required fields: userId, category, or postText');
    }

    let imageUrls = [];
    if (files && files.length > 0) {
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
                    ).end(file.buffer);  // Initiate the upload
                });
            });

            imageUrls = await Promise.all(uploadPromises);
        } catch (error) {
            return res.status(500).send('Error uploading images: ' + error.message);
        }
    }

    // Create the post object
    const post = new Post({
        userId: req.body.userId,
        tags: req.body.tags,
        postText: req.body.postText,
        images: imageUrls,
        sentiment: prediction,
    });

    try {
        // Save the post
        const savedPost = await post.save();

        if (!savedPost) {
            return res.status(500).send('The post cannot be created');
        }

        res.status(201).send(savedPost); // Send the saved post as response
    } catch (error) {
        console.error('Error processing the post:', error);
        res.status(500).send('Error processing the post: ' + error.message);
    }
});



module.exports=router;