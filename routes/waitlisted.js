const express = require("express");
const router = express.Router();
const { User } = require("../models/user");
const { Event } = require("../models/event");
const { Attendance } = require("../models/attendance");
const { Waitlisted } = require("../models/waitlisted");

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

    // 1) Verify event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    // 2) Count registered users (Attendance)
    const registeredCount = await Attendance.countDocuments({
      eventId,
      hasRegistered: true,
    });

    const remainingSlots = Math.max(0, event.maxAttendees - registeredCount);

    // 3) Fetch filtered waitlist
    const waitlist = await Waitlisted.find({
      eventId,
      registered: false,
    })
      .sort({ dateWaitlisted: 1 })
      .lean();

    // 4) Handle empty waitlist
    if (!waitlist || waitlist.length === 0) {
      return res.status(200).json({
        position: null,
        totalWaitlist: 0,
        remainingSlots,
        isTurn: false,
        ahead: [],
        behind: [],
      });
    }

    // 5) Find user's index
    const idx = waitlist.findIndex((w) => w.userId.toString() === userId);

    // If not found, return empty waitlist info (instead of 404)
    if (idx === -1) {
      return res.status(200).json({
        position: null,
        totalWaitlist: waitlist.length,
        remainingSlots,
        isTurn: false,
        ahead: [],
        behind: [],
      });
    }

    // 6) Return user’s waitlist status
    return res.status(200).json({
      position: idx + 1,
      totalWaitlist: waitlist.length,
      remainingSlots,
      isTurn: idx === 0 && remainingSlots > 0,
      ahead: waitlist.slice(0, idx),
      behind: waitlist.slice(idx + 1),
      eliminated: true,
    });
  } catch (err) {
    console.error("Error in /position route:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
});

// DELETE: expire a waitlist entry (either user declined or timeout)
router.post("/expire", async (req, res) => {
  try {
    const { userId, eventId } = req.body;
    if (!userId || !eventId) {
      return res.status(400).json({ message: "userId and eventId required." });
    }

    // Remove that user from the waitlist
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

// Confirm waitlist registration
router.post("/confirm", async (req, res) => {
  try {
    const { userId, eventId } = req.body;

    if (!userId || !eventId) {
      return res
        .status(400)
        .json({ error: "userId and eventId are required." });
    }

    // ✅ Mark user as registered in Waitlisted
    const updated = await Waitlisted.findOneAndUpdate(
      { userId, eventId },
      { registered: true },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "User not found in waitlist." });
    }

    // ✅ Add to Attendance if not yet present
    const alreadyInAttendance = await Attendance.findOne({ userId, eventId });

    if (!alreadyInAttendance) {
      await Attendance.create({
        userId,
        eventId,
        hasRegistered: true,
        hasAttended: false,
      });
    }

    return res.status(200).json({
      message: "User confirmed and added to attendance.",
    });
  } catch (error) {
    console.error("Error in /waitlisted/confirm:", error);
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
