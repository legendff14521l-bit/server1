require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const analyzeRoutes = require("./routes/analyze");
const jobRoutes = require("./routes/jobs");
const discoverRoutes = require("./routes/discover");
const app = express();
const PORT = process.env.PORT || 5000;

// Connect DB
connectDB();

app.use(
  cors({
    origin: "https://git-track-chi.vercel.app/",
    credentials: false
  })
);

app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// API routes (✔ MUST BE BEFORE 404)
app.use("/api/analyze", analyzeRoutes);
app.use("/api/jobs", jobRoutes);   // <-- MOVE HERE
app.use("/api/discover", require("./routes/discover"));

// 404 (✔ MUST BE LAST)
app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("[GlobalError]", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
});
