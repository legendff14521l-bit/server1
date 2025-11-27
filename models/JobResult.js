const mongoose = require("mongoose");

const JobResultSchema = new mongoose.Schema({
  jobId: String,
  username: String,
  score: Number,
  fit: String,  
  explanation: String,
  highlights: [String],
  risks: [String],
  signals: Object,
  profile: Object,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("JobResult", JobResultSchema);
