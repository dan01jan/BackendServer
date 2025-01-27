const express = require('express');
const { User } = require('../models/user');
const { Post } = require('../models/post');
const router = express.Router();
const mongoose = require('mongoose');
const cloudinary = require('../utils/cloudinary');
const uploadOptions = require('../utils/multer');
const streamifier = require('streamifier');



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


router.post('/', uploadOptions.array('images', 10), async (req, res) => {
    console.log('Create Post Request Body:', req.body);

    const { userId, tags, postText } = req.body;
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