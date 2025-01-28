const mongoose = require('mongoose');

const commentSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    default: ''
  },
  sentiment: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const postSchema = new mongoose.Schema({
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event",
        required: false,
      },
      tags: {
        type: [String],
        required: true,
        enum: ["General Discussion", "Help Needed", "Advice", "Opinion", "News", "Event", "Feedback"],
      },
      postText: {
        type: String,
        required: true,
      },
      images: [
        {
          type: String,
          required: false,
        },
      ],
      sentiment: {
        type: String,
        default: ''
      }, 
      comments: [commentSchema]
    },   
    { timestamps: true }
);

exports.Post = mongoose.model('Post', postSchema);