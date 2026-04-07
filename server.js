/**
 * Wardrobe item schema (client / Firestore) — financial fields:
 * purchasePrice (number), wearCount (int), purchaseDate (ISO date string),
 * expectedLifespan (int, days). Derived: costPerWear = purchasePrice / max(wearCount, 1).
 * Legacy: cost (string), timesWorn (int) — mirrored on migrate.
 */
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3001;

const uploadDir = path.join(__dirname, "public", "wardrobe-images");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use("/wardrobe-images", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({ storage });

app.post("/api/upload-image", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({
    filename: req.file.filename,
    url: `http://localhost:3001/wardrobe-images/${req.file.filename}`,
  });
});

app.delete("/api/delete-image/:filename", (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

/** Mock product link ingestion — replace with headless scrape / affiliate API */
app.post("/api/mock-product-link", (req, res) => {
  const url = req.body && typeof req.body.url === "string" ? req.body.url.trim() : "";
  if (!url) return res.status(400).json({ error: "url required" });
  const hash = Math.abs(url.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
  const price = 49 + (hash % 200);
  res.json({
    title: "Imported piece (mock)",
    price,
    imageUrl: `https://picsum.photos/seed/srv${hash}/400/520`,
    sourceUrl: url,
  });
});

app.listen(PORT, () => console.log(`Image server running on port ${PORT}`));
