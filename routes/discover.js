const express = require("express");
const axios = require("axios");
const router = express.Router();

const Job = require("../models/Job");
const {
  fetchGitHubUser,
  fetchUserRepos
} = require("../services/github");

// (AI imports removed – mock-only mode)
// const {
//   aggregateSignals,
//   createWorkabilityProfile
// } = require("../services/signals");

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
    2.5 SIMPLE SKILL TAG EXTRACTOR (UPDATED)
    - keeps frameworks/tools as tags (react, next, node, django, etc.)
    - also keeps languages (javascript, python, ...)
    - canonicalizes aliases (reactjs -> react, next.js -> next, node.js -> node, css3 -> css, html5 -> html)
    - dedupes and caps to 5 (frameworks prioritized)
---------------------------------------------- */
const CANON = {
  "react.js": "react",
  reactjs: "react",
  "react native": "react",
  reactnative: "react",
  "next.js": "next",
  "node.js": "node",
  nodejs: "node",
  css3: "css",
  html5: "html",
};

const FRAMEWORK_KEYS = new Set([
  "react","next","vue","svelte","angular",
  "node","express",
  "mongodb","prisma","firebase",
  "tailwind","bootstrap",
  "django","flask"
]);

const TECH_KEYS = new Set([
  ...VALID_LANGS,
  ...FRAMEWORK_KEYS,
  ...Object.keys(TECH_MAP).map(k => k.toLowerCase()),
]);

function pushToken(buckets, raw) {
  if (!raw) return;
  const t0 = String(raw).toLowerCase();
  const t = CANON[t0] || t0;

  // If it's a known framework/tool, keep it as a tag
  if (FRAMEWORK_KEYS.has(t)) {
    buckets.frameworks.add(t);
    // also add mapped language if exists
    if (TECH_MAP[t]) buckets.langs.add(TECH_MAP[t]);
    return;
  }

  // If it's an exact valid language, keep it
  if (VALID_LANGS.has(t)) {
    buckets.langs.add(t);
    return;
  }

  // If it's in TECH_MAP but not in FRAMEWORK_KEYS (alias), keep alias canonical & language
  if (TECH_MAP[t]) {
    // prefer canonical name if it canonicalizes to a framework
    const canon = CANON[t] || t;
    if (FRAMEWORK_KEYS.has(canon)) {
      buckets.frameworks.add(canon);
    }
    buckets.langs.add(TECH_MAP[t]);
    return;
  }
}

function simplifySkills(input = [], extras = []) {
  const buckets = { frameworks: new Set(), langs: new Set() };

  // parse input values (could be sentences)
  input.forEach(item => {
    if (!item) return;
    const s = String(item).toLowerCase();
    for (const piece of s.split(/[^a-z0-9.+#]+/g)) {
      if (!piece) continue;
      if (TECH_KEYS.has(piece) || CANON[piece] || TECH_MAP[piece]) {
        pushToken(buckets, piece);
      }
    }
  });

  // extras are hints like dominant language / required stack
  extras.forEach(x => pushToken(buckets, x));

  // Build final list: frameworks first (more specific), then languages
  const out = [];
  for (const f of buckets.frameworks) {
    if (out.length < 5) out.push(f);
  }
  for (const l of buckets.langs) {
    if (out.length >= 5) break;
    if (!out.includes(l)) out.push(l);
  }

  return out.slice(0, 5);
}

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
    FINAL VERSION: uses 'skills', removes 'risks', links to 'mailto:'
---------------------------------------------- */
function buildMockCandidate(username, job, index = 0, profile = {}, repos = [], link = "") {
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
  score += Math.min(10, publicRepos / 10);  // 0 → +10
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
  let fit = "Potential Fit";
  if (score >= 88) fit = "Strong Fit";
  else if (score <= 65) fit = "Average";

  // -------------------------------------------
  // 4. Build unique skills (simple tags)
  // -------------------------------------------
  const skills = simplifySkills(
    [mainLang],
    [job.stackMust?.[0], ...sortedLangs.slice(1)]
  );

  return {
    username,
    score: Math.round(score),
    fit,
    skills,
    link: `https://mail.google.com/`, // <--- FINAL MAILTO LINK
    // RISKS FIELD REMOVED
  };
}

/* ---------------------------------------------
    4. FINAL SAFE SEARCH
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
    5. MAIN ROUTE (MOCK-ONLY VERSION)
---------------------------------------------- */
router.get("/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });

    // 1) Discover GitHub users (safe query)
    const githubCandidates = (await safeGitHubSearch(job)).slice(0, 10);
    if (!githubCandidates.length) return res.json([]);

    // 2) Build mock candidates ONLY (no AI)
    const mocked = [];
    for (const [index, user] of githubCandidates.entries()) {
      const username = user.login;
      let profile = {};
      let repos = [];

      try {
        // Optional enrich: pull public stats to make mock scores/skills better
        profile = await fetchGitHubUser(username);
      } catch (e) {
        // ignore; we can still mock
      }

      try {
        repos = await fetchUserRepos(username, 50);
      } catch (e) {
        // ignore; we can still mock
      }

      mocked.push(
        buildMockCandidate(
          username,
          job,
          index,
          profile,
          repos,
          user.html_url // passed through (builder sets its own link)
        )
      );
    }

    // 3) Sort & return TOP 10
    const top10 = mocked
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 10);

    return res.json(top10);
  } catch (err) {
    console.log("[Discover] UNEXPECTED ERROR:", err.message);
    return res.json([]);
  }
});

module.exports = router;
