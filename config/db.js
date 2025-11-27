// db.js
const mongoose = require("mongoose");

// Make buffering errors immediate (must run before models are imported)
mongoose.set("bufferCommands", false);
mongoose.set("strictQuery", true);

let connectPromise = null;

async function connectDB() {
  const uri = process.env.MONGO_URI; // e.g. mongodb+srv://user:pass@cluster/dbname
  if (!uri) {
    throw new Error("[DB] MONGO_URI not set");
  }

  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectPromise) return connectPromise;

  connectPromise = mongoose.connect(uri, {
    // If your URI doesn't include a /dbname, add: dbName: "yourDbName",
    serverSelectionTimeoutMS: 5000, // fail quickly if unreachable
    socketTimeoutMS: 20000,
    maxPoolSize: 10,
  });

  try {
    await connectPromise;
    console.log("[DB] Connected to MongoDB");
    mongoose.connection.on("error", (e) => {
      console.error("[DB] Connection error:", e.message);
    });
    mongoose.connection.on("disconnected", () => {
      console.warn("[DB] Disconnected");
    });
    return mongoose.connection;
  } catch (err) {
    // Important: bubble up so the app doesn't start half-broken
    connectPromise = null;
    throw new Error(`[DB] Failed to connect: ${err.message}`);
  }
}

module.exports = { connectDB };
