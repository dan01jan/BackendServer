const express = require('express');
const router = express.Router();
const { User } = require('../models/user');
const { Attendance } = require('../models/attendance')
const mongoose = require('mongoose');

// Check if User Registered
router.get('/check-registration', async (req, res) => {
    try {
        const { eventId, userId } = req.query;

        if (!eventId || !userId) {
            return res.status(400).json({ message: 'Event ID and User ID are required' });
        }

        const registration = await Attendance.findOne({ eventId, userId });

        if (registration) {
            return res.status(200).json({
                isRegistered: true, 
                hasAttended: registration.hasAttended,  
            });
        } else {
            return res.status(200).json({
                isRegistered: false, 
                hasAttended: false,
            });
        }

    } catch (error) {
        console.error('Error checking registration:', error);
        return res.status(500).json({ message: 'Server error' });
    }
});

// Register User on Event
router.post('/', async (req, res) => {
    try {
        const { userId, eventId } = req.body;

        const existingAttendance = await Attendance.findOne({ userId, eventId });

        if (existingAttendance) {
            return res.status(400).json({ error: 'User has already registered for this event.' });
        }

        const newAttendance = new Attendance({
            userId,
            eventId
        });

        const savedAttendance = await newAttendance.save();
        res.status(201).json(savedAttendance);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get User's Registered Events
router.get('/user/:userId/events', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const attendanceRecords = await Attendance.find({ userId })
            .populate('eventId');
        
        if (!attendanceRecords) {
            return res.status(404).json({ success: false, message: 'No events found for this user' });
        }

        const events = attendanceRecords.map(record => record.eventId);

        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get Event's User Attendance
router.get('/getUsersByEvent/:selectedEvent', async (req, res) => {
    try {
        const eventId = req.params.selectedEvent;
        console.log("Event ID:", eventId);

        const attendanceRecords = await Attendance.find({ eventId });

        if (!attendanceRecords.length) {
            return res.json([]);
        }

        const userIds = attendanceRecords.map(record => record.userId);

        const users = await User.find({ '_id': { $in: userIds } });

        const usersWithAttendance = users.map(user => {
            const attendance = attendanceRecords.find(record => record.userId.toString() === user._id.toString());
            return {
                userId: user._id,
                firstName: user.name,
                lastName: user.surname,
                department: user.department,
                section: user.section,
                hasAttended: attendance ? attendance.hasAttended : false,
                dateRegistered: attendance ? attendance.dateRegistered : null,

            };
        });

        res.json(usersWithAttendance);
    } catch (error) {
        console.error('Error fetching users:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update User's Attendance Status
router.put('/updateUsersAttendance/:selectedEvent', async (req, res) => {
   
    console.log("Received PUT request at /updateUsersAttendance");
    
    try {
        const { selectedEvent } = req.params;
        console.log("Received selected event: ", selectedEvent)
        const users = req.body.attendees;
        console.log("Received users: ", users);

        if (!users || !users.length) {
            return res.status(400).json({ message: 'No users data provided' });
        }

        for (const user of users) {
            const { userId, hasAttended } = user;

            const attendance = await Attendance.findOneAndUpdate(
                { userId, eventId: selectedEvent }, 
                { $set: { hasAttended } },
                { new: true }
            );

            if (!attendance) {
                return res.status(404).json({ message: `Attendance record not found for user ${userId} and event ${selectedEvent}` });
            }
        }

        res.status(200).json({ message: 'Attendance updated successfully' });
    } catch (error) {
        console.error('Error updating attendance:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Count Selected Event's Attendance Count
router.get('/hasAttendedCounts/:selectedEvent', async (req, res) => {
    const selectedEvent = req.params.selectedEvent;

    if (!mongoose.Types.ObjectId.isValid(selectedEvent)) {
        return res.status(400).json({ message: 'Invalid eventId format' });
    }

    const eventId = new mongoose.Types.ObjectId(selectedEvent);

    try {
        const attendedCount = await Attendance.countDocuments({ eventId, hasAttended: true });
        const notAttendedCount = await Attendance.countDocuments({ eventId, hasAttended: false });

        res.status(200).json({ Present: attendedCount, Absent: notAttendedCount });
    } catch (error) {
        console.error('Error fetching attendance counts:', error);
        res.status(500).json({ message: 'Error fetching attendance counts', error: error.message });
    }
});


module.exports = router;
