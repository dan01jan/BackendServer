const express = require("express");
const router = express.Router();

const { Notification } = require("../models/notification");
const { Event } = require("../models/event");
const { User } = require("../models/user");
const Organization = require("../models/organization");

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

    // First, find and mark it as read
    const updated = await Notification.findByIdAndUpdate(
      id,
      { isRead: true },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Notification not found" });
    }

    // Then delete it
    await Notification.findByIdAndDelete(id);

    res.status(200).json({ message: "Notification read and deleted." });
  } catch (err) {
    console.error("❌ Error marking/deleting notification:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { userId, eventId, message } = req.body;

    if (!userId || !message) {
      return res
        .status(400)
        .json({ message: "userId and message are required." });
    }

    const newNotification = new Notification({ userId, eventId, message });
    const saved = await newNotification.save();

    res.status(201).json(saved);
  } catch (err) {
    console.error("❌ Error creating notification:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.post("/waitlist/open/all", async (req, res) => {
  try {
    const now = new Date();
    let totalNotified = 0;

    const allOrgs = await Organization.find({});
    const orgMap = {};
    allOrgs.forEach((org) => {
      const key = org.name.trim().toLowerCase();
      orgMap[key] = org._id.toString();
    });

    const events = await Event.find({ isArchived: { $ne: true } });

    for (const event of events) {
      const startTime = new Date(event.dateStart);
      const endTime = new Date(event.dateEnd);

      if (now >= endTime) continue;

      const thirtyMinutesAfterStart = new Date(
        startTime.getTime() + 30 * 60 * 1000 // 30 minutes
      );

      const sixtyMinutesAfterStart = new Date(
        startTime.getTime() + 60 * 60 * 1000 // 1 hour
      );

      if (now >= thirtyMinutesAfterStart && now < sixtyMinutesAfterStart) {
        const message = `Waitlist for "${event.name}" is now open! Join if you're interested.`;

        const existingNotif = await Notification.findOne({ message });
        if (existingNotif) continue;

        let usersToNotify = [];

        if (event.department === "None") {
          usersToNotify = await User.find({});
        } else {
          const orgName1 = event.organization?.trim().toLowerCase();
          const orgName2 = event.secondOrganization?.trim().toLowerCase();

          const orgId1 = orgMap[orgName1];
          const orgId2 = orgMap[orgName2];

          console.log(`📌 Event: "${event.name}"`);
          console.log(`🔎 Matching org names:`, { orgName1, orgName2 });
          console.log(`🆔 Matched org IDs:`, { orgId1, orgId2 });

          if (!orgId1 && !orgId2) {
            console.warn(
              `⚠️ No matching organization found for event "${event.name}". Skipping.`
            );
            continue;
          }

          // Find users with a matching organization ID and department
          usersToNotify = await User.find({
            organizations: {
              $elemMatch: {
                organization: {
                  $in: [orgId1, orgId2]
                    .filter(Boolean)
                    .map((id) => new mongoose.Types.ObjectId(id)),
                },
                department: event.department,
              },
            },
          });
        }

        if (usersToNotify.length === 0) {
          console.log(`ℹ️ No users found for "${event.name}"`);
          continue;
        }

        const notifications = usersToNotify.map((user) => ({
          userId: user._id,
          message,
        }));

        await Notification.insertMany(notifications);
        totalNotified += notifications.length;

        console.log(
          `✅ Notified ${notifications.length} users for "${event.name}"`
        );
      }
    }

    res.status(200).json({
      message: "Waitlist notifications sent successfully.",
      totalNotified,
    });
  } catch (err) {
    console.error("❌ Error sending waitlist notifications:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

// router.delete("/waitlist/cleanup-notifications", async (req, res) => {
//   try {
//     const now = new Date();
//     const events = await Event.find({ isArchived: { $ne: true } }); // exclude archived events
//     let totalDeleted = 0;

//     for (const event of events) {
//       const startTime = new Date(event.dateStart);
//       const sixtyMinutesAfterStart = new Date(
//         startTime.getTime() + 0.3 * 60 * 1000
//       );

//       const shouldCleanup =
//         now >= sixtyMinutesAfterStart || event.remainingSlots <= 0;

//       if (shouldCleanup) {
//         const messagesToDelete = [
//           `Waitlist for "${event.name}" is now open! Join if you're interested.`,
//           `Waitlist for "${event.name}" has ended.`,
//         ];

//         const deleteResult = await Notification.deleteMany({
//           eventId: event._id,
//           message: { $in: messagesToDelete },
//         });

//         totalDeleted += deleteResult.deletedCount;

//         // console.log(
//         //   `🧹 Cleaned up ${deleteResult.deletedCount} notifications for event: ${event.name}`
//         // );
//       }
//     }

//     res.status(200).json({
//       message: "Expired waitlist-related notifications cleaned up.",
//       totalDeleted,
//     });
//   } catch (err) {
//     console.error("❌ Cleanup error:", err);
//     res.status(500).json({ message: "Internal server error." });
//   }
// });

router.post("/waitlist/timers/check", async (req, res) => {
  try {
    const now = new Date();

    // Populate organization to get the actual ObjectId for comparison
    const events = await Event.find({ isArchived: { $ne: true } }).populate(
      "organization"
    );

    const notificationsSent = [];

    for (const event of events) {
      const startTime = new Date(event.dateStart);
      const endTime = new Date(event.dateEnd);

      const sixtyMinutesAfterStart = new Date(
        startTime.getTime() + 60 * 60 * 1000 // 60 minutes after start
      );

      const oneMinuteBeforeEnd = new Date(
        sixtyMinutesAfterStart.getTime() - 1 * 60 * 1000 // 1 minute before that
      );

      // ⛔ Skip already-ended events
      if (now > endTime) continue;

      // 👥 Determine user query based on department/org
      let users = [];

      if (event.department === "None") {
        users = await User.find({});
      } else {
        if (!event.organization || !event.organization._id) {
          console.warn(
            `⚠️ Skipping event "${event.name}" — missing organization ref`
          );
          continue;
        }

        users = await User.find({
          organization: event.organization._id,
          department: event.department,
        });
      }

      // 🕐 1-Minute Left Notification
      const oneMinMessage = `1 minute left to join waitlist for "${event.name}".`;
      const oneMinAlreadySent = await Notification.exists({
        message: oneMinMessage,
      });

      if (
        now >= oneMinuteBeforeEnd &&
        now < sixtyMinutesAfterStart &&
        !oneMinAlreadySent
      ) {
        const notifs = users.map((u) => ({
          userId: u._id,
          message: oneMinMessage,
        }));
        await Notification.insertMany(notifs);
        notificationsSent.push({
          event: event.name,
          type: "1-minute-left",
          count: notifs.length,
        });
      }

      // 🚫 Waitlist Ended Notification
      const endedMessage = `Waitlist for "${event.name}" has ended.`;
      const endedAlreadySent = await Notification.exists({
        message: endedMessage,
      });

      if (now >= sixtyMinutesAfterStart && !endedAlreadySent) {
        const notifs = users.map((u) => ({
          userId: u._id,
          message: endedMessage,
        }));
        await Notification.insertMany(notifs);
        notificationsSent.push({
          event: event.name,
          type: "ended",
          count: notifs.length,
        });
      }
    }

    res.status(200).json({
      message: "Timer-based waitlist notifications sent.",
      summary: notificationsSent,
    });
  } catch (error) {
    console.error("❌ Error sending timer notifications:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
