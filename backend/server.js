const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const safeName = `${Date.now()}-${file.originalname.replace(/\\s+/g, "-")}`;
    cb(null, safeName);
  }
});

const upload = multer({ storage });

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Learna backend is running"
  });
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      ok: false,
      message: "No file uploaded"
    });
  }

  res.json({
    ok: true,
    message: "File uploaded successfully",
    file: {
      originalName: req.file.originalname,
      savedName: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size
    }
  });
});

app.listen(PORT, () => {
  console.log(`Learna backend running on http://localhost:${PORT}`);
});
