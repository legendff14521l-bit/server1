const express = require("express");
const router = express.Router();

const Analysis = require("../models/Analysis");

const {
  fetchGitHubUser,
  fetchUserRepos
} = require("../services/github");

const {
  aggregateSignals,
  createWorkabilityProfile
} = require("../services/signals");

/**
 * GET /api/analyze/:username
 *
 * Response:
 * {
 *   username,
 *   cached,
 *   signals,
 *   profile,
 *   isMock
 * }
 */
router.get("/:username", async (req, res) => {
  const username = (req.params.username || "").trim().toLowerCase();

  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }

  try {
    /**
     * ---------------------------------------------
     * 1. Try to return cached analysis (last 6 hours)
     * ---------------------------------------------
     */
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    let cached = null;
    try {
      cached = await Analysis.findOne({
        username,
        createdAt: { $gte: sixHoursAgo }
      }).sort({ createdAt: -1 });
    } catch (dbErr) {
      console.warn(
        "[Analyze] Cache lookup failed (continuing):",
        dbErr.message
      );
    }

    if (cached) {
      return res.json({
        username,
        cached: true,
        signals: cached.signals,
        profile: cached.profile,
        isMock: cached.isMock
      });
    }

    /**
     * -------------------------------
     * 2. Fetch GitHub user + repos
     * -------------------------------
     */
    let user;
    try {
      user = await fetchGitHubUser(username);
    } catch (error) {
      if (error.message === "USER_NOT_FOUND") {
        return res.status(404).json({ error: "GitHub user not found." });
      }
      if (error.message === "RATE_LIMIT") {
        return res.status(429).json({
          error:
            "GitHub rate limit exceeded. Add a GitHub token to your .env file."
        });
      }
      throw error; // unknown
    }

    let repos;
    try {
      repos = await fetchUserRepos(username, 100);
    } catch (error) {
      if (error.message === "RATE_LIMIT") {
        return res.status(429).json({
          error:
            "GitHub rate limit exceeded while fetching repos. Please try again later."
        });
      }
      throw error; // unexpected
    }

    /**
     * -------------------------------
     * 3. Compute signals from repos
     * -------------------------------
     */
    const signals = await aggregateSignals(user, repos);

    /**
     * -------------------------------
     * 4. Create Workability Profile
     * -------------------------------
     */
    const { profile, isMock } = await createWorkabilityProfile(signals);

    /**
     * -------------------------------
     * 5. Save to DB (best effort)
     * -------------------------------
     */
    try {
      await Analysis.create({
        username,
        signals,
        profile,
        isMock
      });
    } catch (dbErr) {
      console.warn("[Analyze] Failed to save analysis:", dbErr.message);
    }

    /**
     * -------------------------------
     * 6. Success response
     * -------------------------------
     */
    return res.json({
      username,
      cached: false,
      signals,
      profile,
      isMock
    });
  } catch (err) {
    /**
     * UNIVERSAL CATCH-ALL
     */
    console.error(
      "[Analyze] Error:",
      err.response?.data || err.message || err
    );

    return res.status(500).json({
      error: "Failed to analyze GitHub profile. Try again later."
    });
  }
});

module.exports = router;
