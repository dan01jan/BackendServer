const multer = require("multer");
const path = require("path");

module.exports = multer({
  limits: { fieldSize: 50 * 1024 * 1024 }, // Increase the fieldSize limit
  storage: multer.memoryStorage(), // Use memory storage for Cloudinary upload
  fileFilter: (req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".jpg" && ext !== ".jpeg" && ext !== ".png") {
      cb(new Error("Unsupported file type!"), false);
      return;
    }
    cb(null, true);
  },
});
