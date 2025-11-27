// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { connectDB } = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;

// CORS
const allowed = ["http://localhost:5173", "https://git-track-ashen.vercel.app"];
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / curl / Postman (no origin) and the allowed list
      if (!origin || allowed.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: false,
  })
);

app.use(express.json());

// Health check (reports Mongo state)
app.get("/api/health", (req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  res.json({
    status: "ok",
    mongo: states[mongoose.connection.readyState],
    ts: new Date().toISOString(),
  });
});

// --- Boot sequence: connect DB first, then mount routes, then listen ---
(async () => {
  try {
    await connectDB(); // <-- IMPORTANT: wait for DB

    // Lazy-load routes AFTER DB is ready to avoid early queries
    app.use("/api/analyze", require("./routes/analyze"));
    app.use("/api/jobs", require("./routes/jobs"));
    app.use("/api/discover", require("./routes/discover"));

    // 404 must be last (before error handler)
    app.use((req, res) => {
      res.status(404).json({ error: "Route not found." });
    });

    // Global error handler
    app.use((err, req, res, next) => {
      console.error("[GlobalError]", err);
      res.status(500).json({ error: "Internal server error." });
    });

    app.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("[Server] Failed to start:", err.message);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on("SIGINT", async () => {
  try {
    await mongoose.connection.close();
  } finally {
    process.exit(0);
  }
});
