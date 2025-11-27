const express = require("express");
const router = express.Router();

const Job = require("../models/Job");
const JobResult = require("../models/JobResult");

const { fetchGitHubUser, fetchUserRepos } = require("../services/github");
const { aggregateSignals, createWorkabilityProfile } = require("../services/signals");
const { scoreCandidate } = require("../services/scoring");

/* --------------------------------------------------
   CREATE JOB  (POST /api/jobs)
--------------------------------------------------- */
router.post("/", async (req, res) => {
  try {
    const job = await Job.create(req.body);
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* --------------------------------------------------
   LIST ALL JOBS  (GET /api/jobs)
--------------------------------------------------- */
router.get("/", async (req, res) => {
  const jobs = await Job.find().sort({ createdAt: -1 });
  res.json(jobs);
});

/* --------------------------------------------------
   ANALYZE MULTIPLE USERS FOR A JOB  
   (POST /api/jobs/:id/analyze)
--------------------------------------------------- */
router.post("/:id/analyze", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const usernames = req.body.usernames;
    if (!usernames || usernames.length === 0) {
      return res.status(400).json({ error: "No usernames provided" });
    }

    const results = [];

    for (const username of usernames) {
      try {
        const profile = await fetchGitHubUser(username);
        const repos = await fetchUserRepos(username, 50);

        const signals = await aggregateSignals(profile, repos);
        const { profile: workProfile } = await createWorkabilityProfile(signals);

        const matchData = scoreCandidate(signals, job);

        const saved = await JobResult.create({
          jobId: job.id,
          username,
          ...matchData,
          signals,
          profile: workProfile
        });

        results.push(saved);

      } catch (err) {
        results.push({ username, error: err.message });
      }
    }

    res.json(results);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* --------------------------------------------------
   GET ANALYZED RESULTS FOR JOB
   (GET /api/jobs/:id/results)
--------------------------------------------------- */
router.get("/:id/results", async (req, res) => {
  const results = await JobResult.find({ jobId: req.params.id })
    .sort({ score: -1 });
  res.json(results);
});

/* --------------------------------------------------
   GET JOB BY ID  (MUST BE LAST)
   (GET /api/jobs/:id)
--------------------------------------------------- */
router.get("/:id", async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: "Invalid job ID" });
  }
});

module.exports = router;
