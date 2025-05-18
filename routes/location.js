const express = require("express");
const router = express.Router();
const { Location } = require("../models/location");

// GET all locations
router.get("/", async (req, res) => {
  try {
    const locations = await Location.find();
    res.status(200).json(locations);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving locations", error: err });
  }
});

// GET a single location by ID
router.get("/:id", async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location)
      return res.status(404).json({ message: "Location not found" });
    res.status(200).json(location);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving location", error: err });
  }
});

// CREATE a new location
router.post("/", async (req, res) => {
  const { name, capacity } = req.body;
  if (!name || !capacity) {
    return res.status(400).json({ message: "Name and capacity are required" });
  }

  try {
    const location = new Location({ name, capacity });
    const savedLocation = await location.save();
    res.status(201).json(savedLocation);
  } catch (err) {
    res.status(500).json({ message: "Error creating location", error: err });
  }
});

// UPDATE a location by ID
router.put("/:id", async (req, res) => {
  const { name, capacity } = req.body;

  try {
    const updatedLocation = await Location.findByIdAndUpdate(
      req.params.id,
      { name, capacity },
      { new: true, runValidators: true }
    );

    if (!updatedLocation)
      return res.status(404).json({ message: "Location not found" });
    res.status(200).json(updatedLocation);
  } catch (err) {
    res.status(500).json({ message: "Error updating location", error: err });
  }
});

// DELETE a location by ID
router.delete("/:id", async (req, res) => {
  try {
    const deletedLocation = await Location.findByIdAndDelete(req.params.id);
    if (!deletedLocation)
      return res.status(404).json({ message: "Location not found" });
    res.status(200).json({ message: "Location deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting location", error: err });
  }
});

module.exports = router;
