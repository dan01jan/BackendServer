const express = require("express");
const router = express.Router();
const { User } = require("../models/user");
const { Event } = require("../models/event");
const { Attendance } = require("../models/attendance");
const { Waitlisted } = require("../models/waitlisted");
const mongoose = require("mongoose");

// Check if User Registered

router.get("/", async (req, res) => {
  try {
    const attendance = await Attendance.find();
    res.status(200).json(attendance);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error retrieving attendance", error: err });
  }
});

router.put("/mark-registered/:id", async (req, res) => {
  try {
    const updatedAttendance = await Attendance.findByIdAndUpdate(
      req.params.id,
      { hasRegistered: true },
      { new: true }
    );

    if (!updatedAttendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    res.status(200).json({
      message: "Attendance marked as registered successfully",
      data: updatedAttendance,
    });
  } catch (err) {
    res.status(500).json({
      message: "Error updating attendance",
      error: err.message,
    });
  }
});

router.put("/mark-unregistered/:id", async (req, res) => {
  try {
    const updatedAttendance = await Attendance.findByIdAndUpdate(
      req.params.id,
      { hasRegistered: false },
      { new: true }
    );

    if (!updatedAttendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    res.status(200).json({
      message: "Attendance marked as unregistered successfully",
      data: updatedAttendance,
    });
  } catch (err) {
    res.status(500).json({
      message: "Error updating attendance",
      error: err.message,
    });
  }
});

router.get("/count", async (req, res) => {
  try {
    const { eventId } = req.query;
    console.log("Event ID:", eventId);

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const count = await Attendance.countDocuments({ eventId });

    return res.status(200).json({ count });
  } catch (error) {
    console.error("Error fetching attendance count:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/unattended", async (req, res) => {
  try {
    const { eventId } = req.query;
    console.log("Event ID for remaining-unattended:", eventId);

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const count = await Attendance.countDocuments({
      eventId,
      hasRegistered: false,
    });

    return res.status(200).json({ remainingUnattended: count });
  } catch (error) {
    console.error("Error fetching remaining unattended count:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /slots/remaining?eventId=...
router.get("/slots/remaining", async (req, res) => {
  try {
    const { eventId } = req.query;
    console.log("🔍 [1] Received request for slots with eventId:", eventId);

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const event = await Event.findById(eventId);
    if (!event || !event.capacity || !event.dateStart) {
      return res.status(404).json({ message: "Event not found or incomplete" });
    }

    const now = new Date();
    const thirtyMinutesAfterStart = new Date(
      new Date(event.dateStart).getTime() + 30 * 60000
    );
    const sixtyMinutesAfterStart = new Date(
      new Date(event.dateStart).getTime() + 60 * 60000
    );

    const totalRegistered = await Attendance.countDocuments({ eventId });

    const attendedUsers = await Attendance.find({
      eventId,
      hasAttended: true,
    }).populate("userId", "name email");

    let absentUsers = [];
    let remainingUnattended = 0;

    // Step 1: Fetch original absent users after 30 minutes
    if (now >= thirtyMinutesAfterStart) {
      absentUsers = await Attendance.find({
        eventId,
        hasAttended: false,
      }).populate("userId", "name email");

      remainingUnattended = absentUsers.length;
    }

    // Step 2: Get waitlisted users
    const waitlistedUsers = await Waitlisted.find({ eventId }).populate(
      "userId",
      "name email"
    );

    const waitlistedUnregistered = waitlistedUsers.filter((u) => !u.registered);
    const waitlistedRegistered = waitlistedUsers.filter((u) => u.registered);

    // Step 3: Check replacements after 60 minutes
    let replacedCount = 0;

    if (now >= sixtyMinutesAfterStart) {
      const absenteeDocs = await Attendance.find({
        eventId,
        hasRegistered: false,
      }).sort({ _id: 1 }); // Oldest first for replacement

      for (const wlUser of waitlistedRegistered) {
        const isAttending = await Attendance.findOne({
          eventId,
          userId: wlUser.userId,
        });

        if (isAttending && absenteeDocs[replacedCount]) {
          // Replace one absentee with a waitlisted attendee
          replacedCount++;
        }
      }

      // Adjust remainingUnattended
      remainingUnattended = Math.max(remainingUnattended - replacedCount, 0);
    }

    // Final slot calc
    const remainingSlots =
      event.capacity - totalRegistered + remainingUnattended;
    const safeRemaining = remainingSlots > 0 ? remainingSlots : 0;

    return res.status(200).json({
      capacity: event.capacity,
      totalRegistered,
      totalAttended: attendedUsers.length,
      totalAbsent: absentUsers.length - replacedCount,
      remainingUnattended,
      remainingSlots: safeRemaining,
      replacedCount,

      // Lists
      attendedUsers,
      absentUsers,
      waitlistedUsers,
      waitlistedUnregistered,
      waitlistedRegistered,
    });
  } catch (error) {
    console.error("❌ Error in /slots/remaining:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deletedAttendance = await Attendance.findByIdAndDelete(req.params.id);
    if (!deletedAttendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }
    res.status(200).json({ message: "Attendance deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting attendance", error: err });
  }
});

router.get("/check-registration", async (req, res) => {
  try {
    const { eventId, userId } = req.query;

    if (!eventId || !userId) {
      return res
        .status(400)
        .json({ message: "Event ID and User ID are required" });
    }

    const registration = await Attendance.findOne({ eventId, userId });

    if (registration) {
      return res.status(200).json({
        isRegistered: true,
        hasAttended: registration.hasAttended,
        hasRegistered: registration.hasRegistered,
      });
    } else {
      return res.status(200).json({
        isRegistered: false,
        hasAttended: false,
        hasRegistered: false,
      });
    }
  } catch (error) {
    console.error("Error checking registration:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/attend", async (req, res) => {
  try {
    const { userId, eventId } = req.body;

    // Find the attendance record
    const attendance = await Attendance.findOne({ userId, eventId });

    if (!attendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    // Update hasAttended to true
    attendance.hasAttended = true;
    await attendance.save();

    res
      .status(200)
      .json({ message: "Attendance marked as attended", attendance });
  } catch (error) {
    res.status(500).json({ message: "Error updating attendance", error });
  }
});

// Register User on Event
router.post("/", async (req, res) => {
  try {
    const { userId, eventId } = req.body;

    const existingAttendance = await Attendance.findOne({ userId, eventId });

    if (existingAttendance) {
      return res
        .status(400)
        .json({ error: "User has already registered for this event." });
    }

    const newAttendance = new Attendance({
      userId,
      eventId,
    });

    const savedAttendance = await newAttendance.save();
    res.status(201).json(savedAttendance);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get User's Registered Events
router.get("/user/:userId/events", async (req, res) => {
  try {
    const { userId } = req.params;

    const attendanceRecords = await Attendance.find({ userId }).populate(
      "eventId"
    );

    if (!attendanceRecords) {
      return res
        .status(404)
        .json({ success: false, message: "No events found for this user" });
    }

    const events = attendanceRecords.map((record) => record.eventId);

    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Event's User Attendance
router.get("/getUsersByEvent/:selectedEvent", async (req, res) => {
  try {
    const eventId = req.params.selectedEvent;
    console.log("Event ID:", eventId);

    // Fetch event to check if it has ended
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const now = new Date();
    const eventHasEnded = new Date(event.dateEnd) < now;

    const attendanceRecords = await Attendance.find({ eventId });
    if (!attendanceRecords.length) {
      return res.json([]);
    }

    const userIds = attendanceRecords.map((record) => record.userId);
    const users = await User.find({ _id: { $in: userIds } });

    const usersWithAttendance = users.map((user) => {
      const validDepartment =
        user.organizations?.find((org) => org.department !== "None")
          ?.department || "N/A";
      const record = attendanceRecords.find(
        (r) => r.userId.toString() === user._id.toString()
      );

      const hasAttended = record?.hasAttended;
      const hasRegistered = record?.hasRegistered;
      const dateRegistered = record?.dateRegistered || null;

      return {
        userId: user._id,
        firstName: user.name,
        lastName: user.surname,
        department: validDepartment,
        section: user.section,
        hasAttended: hasAttended === true ? true : eventHasEnded ? false : null,
        hasRegistered,
        dateRegistered,
      };
    });

    res.json(usersWithAttendance);
    console.log("Users with attendance:", usersWithAttendance);
  } catch (error) {
    console.error("Error fetching users:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Update User's Attendance Status
router.put("/updateUsersAttendance/:selectedEvent", async (req, res) => {
  try {
    const { selectedEvent } = req.params;
    const users = req.body.attendees;

    if (!users || !users.length) {
      return res.status(400).json({ message: "No users data provided" });
    }

    // Fetch the event
    const event = await Event.findById(selectedEvent);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    let approvedCount = 0;
    const attendanceUpdates = [];

    // First pass: count how many NEW approvals
    for (const user of users) {
      const { userId, hasRegistered } = user;

      const attendanceBefore = await Attendance.findOne({
        userId,
        eventId: selectedEvent,
      });
      if (!attendanceBefore) {
        return res.status(404).json({
          message: `Attendance record not found for user ${userId} and event ${selectedEvent}`,
        });
      }

      // Count only if we're changing from not registered -> registered
      if (hasRegistered && !attendanceBefore.hasRegistered) {
        approvedCount++;
      }

      // Save this to apply the update after capacity check
      attendanceUpdates.push({ userId, hasRegistered });
    }

    // Check if there's enough capacity
    if (event.remainingCapacity < approvedCount) {
      return res
        .status(400)
        .json({ message: "Not enough capacity for all selected users" });
    }

    // Second pass: apply updates
    for (const update of attendanceUpdates) {
      await Attendance.findOneAndUpdate(
        { userId: update.userId, eventId: selectedEvent },
        { $set: { hasRegistered: update.hasRegistered } },
        { new: true }
      );
    }

    // Deduct the capacity
    event.remainingCapacity -= approvedCount;
    await event.save();

    res.status(200).json({
      message: "Attendance updated and capacity adjusted successfully",
    });
  } catch (error) {
    console.error("Error updating attendance:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Count Selected Event's Attendance Count
router.get("/hasAttendedCounts/:selectedEvent", async (req, res) => {
  const selectedEvent = req.params.selectedEvent;

  if (!mongoose.Types.ObjectId.isValid(selectedEvent)) {
    return res.status(400).json({ message: "Invalid eventId format" });
  }

  const eventId = new mongoose.Types.ObjectId(selectedEvent);

  try {
    const attendedCount = await Attendance.countDocuments({
      eventId,
      hasAttended: true,
    });
    const notAttendedCount = await Attendance.countDocuments({
      eventId,
      hasAttended: false,
    });

    res.status(200).json({ Present: attendedCount, Absent: notAttendedCount });
  } catch (error) {
    console.error("Error fetching attendance counts:", error);
    res.status(500).json({
      message: "Error fetching attendance counts",
      error: error.message,
    });
  }
});

module.exports = router;
