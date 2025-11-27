const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema({
  title: String,
  location: String,
  seniority: String,

  stackMust: [String],
  stackNice: [String],

  responsibilities: String,
  culture: String,
  salaryRange: String,

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Job", JobSchema);
