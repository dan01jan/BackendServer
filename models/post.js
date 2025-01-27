const mongoose = require('mongoose');

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
    },
    { timestamps: true }
);

exports.Post = mongoose.model('Post', postSchema);