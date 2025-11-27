const express = require("express");
const axios = require("axios");
const router = express.Router();

const Job = require("../models/Job");
const {
  fetchGitHubUser,
  fetchUserRepos
} = require("../services/github");

const {
  aggregateSignals,
  createWorkabilityProfile
} = require("../services/signals");

/* ---------------------------------------------
   1. VALID GITHUB LANGUAGES ONLY
---------------------------------------------- */
const VALID_LANGS = new Set([
  "javascript", "typescript", "python", "java", "php",
  "c", "cpp", "go", "ruby", "kotlin", "swift",
  "rust", "html", "css", "sql", "shell", "dart"
]);

/* ---------------------------------------------
   2. FRAMEWORK → LANGUAGE MAPPING
---------------------------------------------- */
const TECH_MAP = {
  react: "javascript",
  "react.js": "javascript",
  reactjs: "javascript",
  "react native": "javascript",
  reactnative: "javascript",

  next: "javascript",
  "next.js": "javascript",

  vue: "javascript",
  svelte: "javascript",
  angular: "typescript",

  node: "javascript",
  nodejs: "javascript",
  "node.js": "javascript",
  express: "javascript",

  mongodb: "javascript",
  prisma: "javascript",
  firebase: "javascript",

  tailwind: "css",
  bootstrap: "css",
  css3: "css",
  html5: "html",

  django: "python",
  flask: "python",
};

/* ---------------------------------------------
   3. CLEAN & VALIDATE TECH LIST
---------------------------------------------- */
function normalizeTechList(list = []) {
  const output = [];

  list.forEach((raw) => {
    if (!raw) return;

    const key = raw.toLowerCase().trim();

    // If React → javascript, Next.js → javascript, etc…
    if (TECH_MAP[key]) {
      output.push(TECH_MAP[key]);
      return;
    }

    // If it is a valid GitHub language (html, css, sql, python…)
    if (VALID_LANGS.has(key)) {
      output.push(key);
      return;
    }
  });

  return [...new Set(output)]; // dedupe
}

/* ---------------------------------------------
   Helper: detect OpenAI-related failures
---------------------------------------------- */
function isOpenAIError(err) {
  const msg =
    (err && err.message) ||
    (err && err.response && err.response.data && err.response.data.error && err.response.data.error.message) ||
    String(err || "");

  return /openai|insufficient_quota|context_length|max tokens|max context|context_length_exceeded|model_/i.test(
    msg
  );
}

/* ---------------------------------------------
   Helper: build mock candidate when AI fails
---------------------------------------------- */
function buildMockCandidate(username, job, index = 0, profile = {}, repos = []) {
  // -------------------------------------------
  // 1. Extract real GitHub stats where possible
  // -------------------------------------------
  const followers = profile.followers || 0;
  const publicRepos = profile.public_repos || 0;

  // Infer dominant languages from repos
  const langCount = {};
  repos.forEach((r) => {
    if (r.language) {
      const lang = r.language.toLowerCase();
      langCount[lang] = (langCount[lang] || 0) + 1;
    }
  });

  const sortedLangs = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang)
    .slice(0, 3);

  const mainLang = sortedLangs[0] || job?.stackMust?.[0] || "javascript";

  // -------------------------------------------
  // 2. Build a semi-realistic mock score
  // -------------------------------------------
  let score = 65;

  score += Math.min(20, followers / 5);      // 0 → +20
  score += Math.min(10, publicRepos / 10);   // 0 → +10
  if (sortedLangs.includes(job?.stackMust?.[0]?.toLowerCase())) {
    score += 10;
  }

  // Make top candidates stronger
  score += Math.max(0, 12 - index * 2);

  if (score > 95) score = 95;
  if (score < 55) score = 55;

  // -------------------------------------------
  // 3. Determine fit level
  // -------------------------------------------
  let fit = "Potential Fit (mock)";
  if (score >= 88) fit = "Strong Fit (mock)";
  else if (score <= 65) fit = "Needs Review (mock)";

  // -------------------------------------------
  // 4. Build unique highlights
  // -------------------------------------------
  const highlights = [
    `Primary language: ${mainLang}`,
    `Estimated ${publicRepos} public repositories`,
    `Approx. ${followers} followers`,
    `Likely experienced with ${job.stackMust?.[0] || "the required stack"}`
  ];

  if (sortedLangs.length > 1) {
    highlights.push(`Additional languages: ${sortedLangs.slice(1).join(", ")}`);
  }

  if (publicRepos > 20) {
    highlights.push("Shows strong activity and repository history");
  }

  if (followers > 50) {
    highlights.push("Strong GitHub presence and community visibility");
  }

  // -------------------------------------------
  // 5. Build unique risks
  // -------------------------------------------
  const risks = [];

  if (publicRepos < 5) risks.push("Low public repository activity");
  if (followers < 10) risks.push("Limited social proof on GitHub");
  if (!sortedLangs.includes(job?.stackMust?.[0]?.toLowerCase())) {
    risks.push(`Unclear depth in ${job.stackMust?.[0]}`);
  }

  risks.push("This candidate was evaluated using mock AI (OpenAI quota bypass)");

  return {
    username,
    score: Math.round(score),
    fit,
    highlights,
    risks
  };
}

/* ---------------------------------------------
   4. FINAL SAFE SEARCH
   Guaranteed valid GitHub query
   Returns up to 10 candidates
---------------------------------------------- */
async function safeGitHubSearch(job) {
  try {
    const must = normalizeTechList(job.stackMust);
    const nice = normalizeTechList(job.stackNice);

    let skills = [...must, ...nice];

    /* ⚠ If invalid OR empty → fallback query */
    if (skills.length === 0) {
      const q = "type:user repos:>5 followers:>20";
      const res = await axios.get("https://api.github.com/search/users", {
        params: { q, per_page: 10 },
        headers: { "User-Agent": "matchrank-app" }
      });
      return res.data.items || [];
    }

    /* Build fully safe query */
    const q =
      skills
        .filter((s) => VALID_LANGS.has(s))
        .map((s) => `language:${s}`)
        .join(" ") +
      " type:user";

    /* FINAL SANITY CHECK */
    if (!q.includes("language:") || q.includes("language:undefined")) {
      const fallbackQuery = "type:user repos:>5 followers:>20";
      const res = await axios.get("https://api.github.com/search/users", {
        params: { q: fallbackQuery, per_page: 10 },
        headers: { "User-Agent": "matchrank-app" }
      });
      return res.data.items || [];
    }

    const res = await axios.get("https://api.github.com/search/users", {
      params: { q, per_page: 10 },
      headers: { "User-Agent": "matchrank-app" }
    });

    return res.data.items || [];
  } catch (err) {
    console.log("[Discover] GitHub search failed:", err.message);
    return [];
  }
}

/* ---------------------------------------------
   5. MAIN ROUTE
---------------------------------------------- */
router.get("/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    // 1. Search GitHub (up to 10 users, guaranteed valid)
    const githubCandidates = (await safeGitHubSearch(job)).slice(0, 10);

    if (!githubCandidates.length) return res.json([]);

    // 2. Analyze each user
    const analyzed = [];
    let openAIProblem = false;

    for (const [index, user] of githubCandidates.entries()) {
      const username = user.login;

      try {
        const profile = await fetchGitHubUser(username);
        const repos = await fetchUserRepos(username, 50);
        const signals = await aggregateSignals(profile, repos);
        const { profile: workProfile } = await createWorkabilityProfile(signals);

        analyzed.push({
          username,
          score: workProfile.score || 0,
          fit: workProfile.labels?.fit || "Unknown",
          highlights: workProfile.highlights || [],
          risks: workProfile.risks || []
        });
      } catch (err) {
        console.log("[Discover] Skip or mock:", username, err.message);

        if (isOpenAIError(err)) {
          // Mark that OpenAI is unhappy; we'll use mock data.
          openAIProblem = true;
          // We don't break; we still want to generate mocks for everyone after.
          break;
        }
      }
    }

    let finalList = analyzed;

    // 3. If OpenAI blew up (tokens/quota/etc.), build mock data
    if (openAIProblem) {
      console.log("[Discover] OpenAI error detected – using mock candidates.");

      finalList = githubCandidates.slice(0, 10).map((user, index) =>
        buildMockCandidate(user.login, job, index)
      );
    } else {
      if (!analyzed.length) {
        finalList = githubCandidates.slice(0, 10).map((user, index) =>
          buildMockCandidate(user.login, job, index)
        );
      }
    }

    // 4. Sort & return TOP 10
    const top10 = finalList
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 10);

    return res.json(top10);
  } catch (err) {
    console.log("[Discover] UNEXPECTED ERROR:", err.message);
    // keep behavior: empty array on unexpected failure
    return res.json([]);
  }
});

module.exports = router;
