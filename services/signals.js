const OpenAI = require("openai");
const {
  fetchGitHubUser,
  fetchUserRepos,
  fetchRepoLanguages,
  fetchRepoCommits
} = require("./github");

/**
 * PROJECT TYPE DETECTION KEYWORDS
 */
const PROJECT_TYPE_KEYWORDS = {
  web: ["web", "site", "app", "frontend", "backend", "server", "api", "http"],
  cli: ["cli", "command", "terminal", "tool"],
  library: ["lib", "library", "package", "sdk", "framework"],
  data: ["data", "ml", "machine-learning", "ai", "analytics", "database"],
  mobile: ["mobile", "ios", "android", "react-native", "flutter"],
  devops: ["docker", "kubernetes", "ci", "cd", "deploy", "infrastructure"]
};

/**
 * OPENAI INITIALIZATION
 */
let openaiClient = null;

function isOpenAIConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

if (isOpenAIConfigured()) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

/**
 * ----------------------------------------------------------
 * 1) AGGREGATE SIGNALS (Main GitHub logic)
 * ----------------------------------------------------------
 */
async function aggregateSignals(user, repos) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const accountCreated = new Date(user.created_at);
  const accountAgeDays = Math.floor(
    (Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24)
  );

  const languageTotals = {};
  let starsTotal = 0;
  let forksTotal = 0;
  let recentCommitVelocity = 0;
  const activeDaysSet = new Set();
  const projectTypes = new Set();
  let collaborationHint = false;

  // Top 10 repos by stars
  const topRepos = repos
    .slice()
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    .slice(0, 10);

  /**
   * Extract basic signals from top repos
   */
  for (const repo of topRepos) {
    starsTotal += repo.stargazers_count || 0;
    forksTotal += repo.forks_count || 0;

    const repoName = (repo.name || "").toLowerCase();
    const repoDesc = (repo.description || "").toLowerCase();
    const keywords = `${repoName} ${repoDesc}`;

    for (const [type, list] of Object.entries(PROJECT_TYPE_KEYWORDS)) {
      if (list.some((kw) => keywords.includes(kw))) {
        projectTypes.add(type);
      }
    }
  }

  /**
   * Fetch languages + commits in parallel for all top repos
   */
  const repoDataPromises = topRepos.map(async (repo) => {
    const [languagesRes, commitsRes] = await Promise.allSettled([
      fetchRepoLanguages(user.login, repo.name),
      fetchRepoCommits(user.login, repo.name, 20)
    ]);

    return {
      repo,
      languages:
        languagesRes.status === "fulfilled" ? languagesRes.value : {},
      commits: commitsRes.status === "fulfilled" ? commitsRes.value : []
    };
  });

  const resolvedRepoData = await Promise.allSettled(repoDataPromises);

  /**
   * Aggregate signals
   */
  for (const item of resolvedRepoData) {
    if (item.status === "rejected") continue;

    const { languages, commits } = item.value;

    // Accumulate languages
    for (const [lang, bytes] of Object.entries(languages)) {
      languageTotals[lang] = (languageTotals[lang] || 0) + bytes;
    }

    // Process commits
    for (const commit of commits) {
      const commitDate = new Date(commit.commit.author.date);

      if (commitDate >= thirtyDaysAgo) {
        recentCommitVelocity++;
        activeDaysSet.add(commitDate.toISOString().split("T")[0]);
      }

      if (commit.author && commit.author.login !== user.login) {
        collaborationHint = true;
      }
    }
  }

  const totalBytes = Object.values(languageTotals).reduce((a, b) => a + b, 0);

  const primaryLanguages =
    totalBytes > 0
      ? Object.entries(languageTotals)
          .map(([name, bytes]) => ({
            name,
            percentage: (bytes / totalBytes) * 100
          }))
          .sort((a, b) => b.percentage - a.percentage)
          .slice(0, 3)
      : [];

  return {
    primary_languages: primaryLanguages,
    repo_count: repos.length,
    stars_total: starsTotal,
    forks_total: forksTotal,
    recent_commit_velocity: recentCommitVelocity,
    active_days: activeDaysSet.size,
    project_types: Array.from(projectTypes),
    collaboration_hint: collaborationHint,
    account_age_days: accountAgeDays,
    top_repos: topRepos.slice(0, 5).map((repo) => ({
      name: repo.name,
      stars: repo.stargazers_count || 0,
      language: repo.language,
      recent_activity: new Date(repo.pushed_at) >= thirtyDaysAgo
    }))
  };
}

/**
 * ----------------------------------------------------------
 * 2) MOCK PROFILE GENERATION (fallback)
 * ----------------------------------------------------------
 */
function generateMockProfile(signals) {
  const {
    primary_languages,
    recent_commit_velocity,
    active_days,
    stars_total,
    repo_count
  } = signals;

  const skills = primary_languages.map((lang, index) => ({
    skill: lang.name,
    confidence: index === 0 ? "High" : index === 1 ? "Med" : "Low"
  }));

  // Expand skills via project types
  if (signals.project_types.includes("web"))
    skills.push({ skill: "Web Development", confidence: "High" });

  if (signals.project_types.includes("data"))
    skills.push({ skill: "Data Analysis", confidence: "Med" });

  if (signals.collaboration_hint)
    skills.push({ skill: "Team Collaboration", confidence: "Med" });

  // Always include Git
  skills.push({ skill: "Version Control (Git)", confidence: "High" });

  const realWorkEvidence = [
    `Maintains ${repo_count} public repositories with ${stars_total} total stars`,
    signals.top_repos[0]
      ? `Primary project: ${signals.top_repos[0].name} (${signals.top_repos[0].stars} stars${
          signals.top_repos[0].language
            ? `, ${signals.top_repos[0].language}`
            : ""
        })`
      : "Active repository management",
    `${recent_commit_velocity} commits in last 30 days across ${active_days} active days`,
    signals.collaboration_hint
      ? "Demonstrated collaboration through team repos"
      : "Strong project ownership and solo development"
  ];

  const activeMaintained = signals.top_repos.filter((r) => r.recent_activity)
    .length;

  if (activeMaintained >= 2) {
    realWorkEvidence.push(`${activeMaintained} actively maintained projects`);
  }

  /**
   * EXPERIENCE LEVEL ESTIMATION
   */
  const yearsOnGitHub = signals.account_age_days / 365;
  const activityScore = (recent_commit_velocity / 30) * active_days;

  let experienceLevel = "Junior";
  let rationale = `${yearsOnGitHub.toFixed(
    1
  )} years on GitHub, building foundation.`;

  if (yearsOnGitHub >= 5 && stars_total >= 50 && activityScore >= 20) {
    experienceLevel = "Senior";
    rationale = `${yearsOnGitHub.toFixed(
      1
    )} years, strong community engagement, high activity.`;
  } else if (yearsOnGitHub >= 2 && (stars_total >= 10 || activityScore >= 10)) {
    experienceLevel = "Mid";
    rationale = `${yearsOnGitHub.toFixed(
      1
    )} years, solid contribution patterns.`;
  }

  const workStyle = [
    {
      trait: "Consistency",
      description:
        active_days >= 15
          ? "Highly consistent daily activity"
          : "Periodic bursts of contribution"
    },
    {
      trait: "Ownership",
      description:
        repo_count >= 10
          ? "Strong ownership of multiple projects"
          : "Building project responsibility"
    },
    {
      trait: "Collaboration",
      description: signals.collaboration_hint
        ? "Comfortable collaborating in teams"
        : "Independent and self-driven"
    },
    {
      trait: "Shipping Velocity",
      description:
        recent_commit_velocity >= 30
          ? "High-velocity shipping"
          : "Moderate, quality-focused workflow"
    }
  ];

  /**
   * ROLE FITS
   */
  const roleFits = [];
  const langs = primary_languages.map((l) => l.name);

  if (langs.some((l) => ["JavaScript", "TypeScript"].includes(l))) {
    roleFits.push("Full-stack JavaScript Developer");
    if (signals.project_types.includes("web"))
      roleFits.push("Frontend Engineer");
  }

  if (langs.includes("Python")) {
    roleFits.push("Backend Developer (Python)");
    if (signals.project_types.includes("data"))
      roleFits.push("Data Engineer");
  }

  if (signals.project_types.includes("devops"))
    roleFits.push("DevOps Engineer");

  if (roleFits.length === 0)
    roleFits.push(`${langs[0] || "Software"} Developer`);

  if (roleFits.length < 3 && signals.project_types.includes("library"))
    roleFits.push("SDK/Library Developer");

  if (roleFits.length < 5 && experienceLevel === "Senior")
    roleFits.push("Technical Lead");

  /**
   * WORKABILITY SCORE
   */
  const score = Math.min(
    100,
    Math.round(
      (stars_total / 10) * 0.2 +
        (recent_commit_velocity / 2) * 0.3 +
        active_days * 1.5 +
        (signals.collaboration_hint ? 10 : 0) +
        (experienceLevel === "Senior"
          ? 20
          : experienceLevel === "Mid"
          ? 10
          : 5)
    )
  );

  return {
    skills: skills.slice(0, 10),
    real_work_evidence: realWorkEvidence.slice(0, 6),
    experience_level: {
      level: experienceLevel,
      rationale
    },
    work_style: workStyle,
    role_fits: roleFits.slice(0, 5),
    workability_score: {
      score,
      rationale:
        score >= 75
          ? "Strong track record with consistent contributions."
          : score >= 50
          ? "Solid foundation with growth potential."
          : "Early-stage developer building a portfolio."
    }
  };
}

/**
 * ----------------------------------------------------------
 * 3) OPENAI → Workability Profile Generation
 * ----------------------------------------------------------
 */
async function generateWorkabilityProfileWithAI(signals) {
  if (!openaiClient) throw new Error("OpenAI not configured");

  const systemPrompt = `
You are an expert hiring manager.
Return JSON ONLY in this exact structure:

{
  "skills": [{ "skill": "string", "confidence": "High|Med|Low" }],
  "real_work_evidence": ["string"],
  "experience_level": { "level": "Junior|Mid|Senior", "rationale": "string" },
  "work_style": [{ "trait": "string", "description": "string" }],
  "role_fits": ["string"],
  "workability_score": { "score": number, "rationale": "string" }
}
`;

  const completion = await openaiClient.chat.completions.create({
    model: "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({ type: "CandidateSignals", data: signals })
      }
    ]
  });

  const json = completion.choices[0].message.content;
  return JSON.parse(json);
}

/**
 * Wrapper — call OpenAI OR use fallback mock mode
 */
async function createWorkabilityProfile(signals) {
  if (isOpenAIConfigured()) {
    try {
      const profile = await generateWorkabilityProfileWithAI(signals);
      return { profile, isMock: false };
    } catch (err) {
      console.error("[AI] Failed, using mock:", err.message);
      return { profile: generateMockProfile(signals), isMock: true };
    }
  }

  return { profile: generateMockProfile(signals), isMock: true };
}

module.exports = {
  aggregateSignals,
  generateMockProfile,
  createWorkabilityProfile
};
