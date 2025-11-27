const mongoose = require("mongoose");

const candidateSchema = new mongoose.Schema({
  name: String,
  email: String,
  github: String,
  location: String,
  seniority: String,
  experienceYears: Number,
  skills: [String],
  languages: [String],
  projects: [
    {
      name: String,
      description: String,
      tech: [String],
    }
  ]
});

module.exports = mongoose.model("Candidate", candidateSchema);
