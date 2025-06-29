const mongoose = require("mongoose");

const waitlistedSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true,
  },
  dateWaitlisted: {
    type: Date,
    default: Date.now,
  },
  registered: {
    type: Boolean,
    default: false,
  },
});

waitlistedSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

waitlistedSchema.set("toJSON", {
  virtuals: true,
});

exports.Waitlisted = mongoose.model("Waitlisted", waitlistedSchema);
