const express = require("express");
const router = express.Router();

const { Notification } = require("../models/notification");


router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50); // or paginate if needed

    res.status(200).json(notifications);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /notifications/:id/read
router.put("/:id/read", async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Notification.findByIdAndUpdate(
      id,
      { isRead: true },
      { new: true }
    );
    res.status(200).json(updated);
  } catch (err) {
    console.error("Error updating notification:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router; 