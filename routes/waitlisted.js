const express = require("express");
const router = express.Router();
const { User } = require("../models/user");
const { Event } = require("../models/event");
const { Attendance } = require("../models/attendance");
const { Waitlisted } = require("../models/waitlisted");
const { Notification } = require("../models/notification");

const mongoose = require("mongoose");

// Waitlist User on Event
router.post("/", async (req, res) => {
  try {
    const { userId, eventId } = req.body;

    if (!userId || !eventId) {
      return res
        .status(400)
        .json({ error: "userId and eventId are required." });
    }

    // Check if user is already registered
    const existingAttendance = await Attendance.findOne({ userId, eventId });
    if (existingAttendance) {
      return res.status(400).json({
        error:
          "User is already registered for this event. No need to waitlist.",
      });
    }

    // Check if user is already waitlisted
    const existingWaitlist = await Waitlisted.findOne({ userId, eventId });
    if (existingWaitlist) {
      return res
        .status(400)
        .json({ error: "User is already waitlisted for this event." });
    }

    // Verify event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    // Add to waitlist
    const newWaitlisted = new Waitlisted({ userId, eventId });
    const savedWaitlist = await newWaitlisted.save();

    return res.status(201).json({
      message: "User successfully added to the waitlist.",
      data: savedWaitlist,
    });
  } catch (error) {
    console.error("Error in waitlist route:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/check/:userId/:eventId", async (req, res) => {
  try {
    console.log("dito so nice");

    const { userId, eventId } = req.params;

    if (!userId || !eventId) {
      return res
        .status(400)
        .json({ error: "userId and eventId are required." });
    }

    const waitlistEntry = await Waitlisted.findOne({ userId, eventId });

    if (waitlistEntry) {
      return res.status(200).json({ isWaitlisted: true });
    } else {
      return res.status(200).json({ isWaitlisted: false });
    }
  } catch (error) {
    console.error("Error checking waitlist status:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// GET: First waitlisted user for a specific event
router.get("/first/:eventId", async (req, res) => {
  try {
    const firstEntry = await Waitlisted.findOne({
      eventId: req.params.eventId,
    })
      .sort({ dateWaitlisted: 1 }) // earliest first
      .populate("userId");

    if (!firstEntry) {
      return res.status(404).json({ message: "No waitlist found." });
    }

    res.status(200).json(firstEntry);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

router.get("/position/:eventId/:userId", async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    // 1) Get the event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    // 2) Get number of attendees who are registered but not yet attended
    const registeredCount = await Attendance.countDocuments({
      eventId,
      hasRegistered: true,
      hasAttended: false,
    });

    const remainingSlots = Math.max(
      0,
      (event?.capacity || 0) - registeredCount
    );

    // 3) Check if user is on the waitlist
    const userWaitlistEntry = await Waitlisted.findOne({
      eventId,
      userId,
      registered: false,
    });

    // 4) Get full waitlist (even if user isn't part of it)
    const waitlist = await Waitlisted.find({
      eventId,
      registered: false,
    })
      .sort({ dateWaitlisted: 1 })
      .lean();

    const totalWaitlist = waitlist.length;

    // 5) If user is NOT in the waitlist
    if (!userWaitlistEntry) {
      return res.status(200).json({
        position: null,
        totalWaitlist,
        remainingSlots,
        isTurn: false,
        ahead: [],
        behind: [],
        message: "You are not on the waitlist.",
      });
    }

    // 6) Get user's position (now that we confirmed they're in waitlist)
    const idx = waitlist.findIndex((w) => w.userId.toString() === userId);

    const isTurn = idx === 0 && remainingSlots > 0;

    return res.status(200).json({
      position: idx + 1,
      totalWaitlist,
      remainingSlots,
      isTurn,
      ahead: waitlist.slice(0, idx),
      behind: waitlist.slice(idx + 1),
      message: isTurn
        ? "It’s your turn!"
        : remainingSlots === 0
        ? "All slots are currently filled. Please wait."
        : "Waiting on your turn.",
    });
  } catch (err) {
    console.error("Error in /position route:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
});

// DELETE: expire a waitlist entry (either user declined or timeout)
router.delete("/expire/:userId/:eventId", async (req, res) => {
  try {
    const { userId, eventId } = req.params;

    if (!userId || !eventId) {
      return res.status(400).json({ message: "userId and eventId required." });
    }

    const deleted = await Waitlisted.findOneAndDelete({ userId, eventId });

    if (!deleted) {
      return res.status(404).json({ message: "Waitlist entry not found." });
    }

    return res.status(200).json({ message: "Waitlist entry removed." });
  } catch (err) {
    console.error("Error expiring waitlist entry:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
});

router.delete("/:eventId/:userId", async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    await Waitlisted.findOneAndDelete({ eventId, userId });
    return res.status(200).json({ message: "Removed from waitlist." });
  } catch (err) {
    console.error("Error removing from waitlist:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/confirm", async (req, res) => {
  try {
    const { userId, eventId } = req.body;

    if (!userId || !eventId) {
      return res
        .status(400)
        .json({ error: "userId and eventId are required." });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found." });

    const now = new Date();
    const oneHourAfterStart = new Date(event.dateStart);
    oneHourAfterStart.setSeconds(oneHourAfterStart.getSeconds() + 30);

    // ✅ Update waitlist
    const updated = await Waitlisted.findOneAndUpdate(
      { userId, eventId },
      { registered: true },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ error: "User not found in waitlist." });
    }

    let attendance = await Attendance.findOne({ userId, eventId });
    if (!attendance) {
      attendance = await Attendance.create({
        userId,
        eventId,
        hasRegistered: true,
        hasAttended: false,
      });
      console.log("✅ Attendance created:", attendance);
    } else if (!attendance.hasRegistered) {
      attendance.hasRegistered = true;
      await attendance.save();
      console.log("✅ Attendance updated to hasRegistered = true:", attendance);
    } else {
      console.log("ℹ️ User already registered in attendance:", attendance);
    }

    let displacedUser = null;

    const unconfirmed = await Attendance.find({
      eventId,
      hasRegistered: false,
    }).sort({ dateRegistered: 1 });

    console.log(
      "🔎 Unconfirmed users:",
      unconfirmed.map((u) => u.userId)
    );

    if (unconfirmed.length > 0) {
      displacedUser = unconfirmed[0].userId;
      console.log("⚠️ Displaced user candidate:", displacedUser);

      const activeFromWaitlist = await Waitlisted.findOne({
        eventId,
        registered: true,
        userId,
      });

      const attendanceOfWaitlisted = await Attendance.findOne({
        userId,
        eventId,
        hasRegistered: true,
      });

      console.log("🔍 Confirming waitlisted registration:");
      console.log(" - Waitlist record found:", !!activeFromWaitlist);
      console.log(" - Attendance record found:", !!attendanceOfWaitlisted);

      if (activeFromWaitlist && attendanceOfWaitlisted) {
        await Notification.create({
          userId: displacedUser,
          message: `Your slot for "${event.name}" may have been taken by a waitlisted user because you didn't confirm attendance.`,
        });
      } else {
      }
    } else {
      console.log("ℹ️ No unconfirmed users found.");
    }

    return res.status(200).json({
      message: "Waitlisted user confirmed successfully.",
      displacedUser,
    });
  } catch (error) {
    console.error("❌ Error in /waitlisted/confirm:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

// GET: Full waitlist for an event
router.get("/all/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    const waitlist = await Waitlisted.find({ eventId })
      .sort({ dateWaitlisted: 1 })
      .populate("userId", "name email") // optional: populate some info
      .lean();

    res.status(200).json(waitlist);
  } catch (err) {
    console.error("Error fetching full waitlist:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
});

module.exports = router;
