const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.warn("[DB] No MONGO_URI provided – running without database.");
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000
    });
    console.log("[DB] Connected to MongoDB");
  } catch (err) {
    console.error("[DB] MongoDB connection error:", err.message);
  }
}

module.exports = connectDB;
