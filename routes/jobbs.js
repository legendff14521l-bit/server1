import Candidate from "../models/Candidate.js";
import { scoreCandidate } from "../services/matchEngine.js";

router.get("/jobs/:jobId/discover", async (req, res) => {
  const { jobId } = req.params;

  try {
    const job = await JobModel.findById(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    // 1. GET ALL CANDIDATES FROM REAL DB
    const candidates = await Candidate.find();

    // 2. SCORE THEM
    const scored = candidates.map(c => {
      const analysis = scoreCandidate(c, job);
      return {
        _id: c._id,
        name: c.name,
        username: c.email,
        score: analysis.score,
        fit: analysis.fitLabel,
        highlights: analysis.highlights,
        risks: analysis.risks,
        skills: c.skills,
        experienceYears: c.experienceYears,
      };
    });

    // 3. SORT BY SCORE DESCENDING
    const sorted = scored.sort((a, b) => b.score - a.score);

    // 4. RETURN TOP 10
    res.json(sorted.slice(0, 10));

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to discover candidates" });
  }
});
