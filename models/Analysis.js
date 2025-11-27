const mongoose = require("mongoose");

const WorkStyleSchema = new mongoose.Schema(
  {
    trait: String,
    description: String
  },
  { _id: false }
);

const SkillSchema = new mongoose.Schema(
  {
    skill: String,
    confidence: {
      type: String // "High" | "Med" | "Low"
    }
  },
  { _id: false }
);

const ExperienceLevelSchema = new mongoose.Schema(
  {
    level: String, // "Junior" | "Mid" | "Senior"
    rationale: String
  },
  { _id: false }
);

const WorkabilityScoreSchema = new mongoose.Schema(
  {
    score: Number,
    rationale: String
  },
  { _id: false }
);

const CandidateSignalsSchema = new mongoose.Schema(
  {
    primary_languages: [
      {
        name: String,
        percentage: Number
      }
    ],
    repo_count: Number,
    stars_total: Number,
    forks_total: Number,
    recent_commit_velocity: Number,
    active_days: Number,
    project_types: [String],
    collaboration_hint: Boolean,
    account_age_days: Number,
    top_repos: [
      {
        name: String,
        stars: Number,
        language: String,
        recent_activity: Boolean
      }
    ]
  },
  { _id: false }
);

const AnalysisSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, index: true },
    signals: CandidateSignalsSchema,
    profile: {
      skills: [SkillSchema],
      real_work_evidence: [String],
      experience_level: ExperienceLevelSchema,
      work_style: [WorkStyleSchema],
      role_fits: [String],
      workability_score: WorkabilityScoreSchema
    },
    isMock: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Example TTL (optional): auto delete after 12h
// AnalysisSchema.index({ createdAt: 1 }, { expireAfterSeconds: 43200 });

module.exports = mongoose.model("Analysis", AnalysisSchema);
