const OpenAI = require("openai");

let openai = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
} else {
  console.warn("[AI] No OPENAI_API_KEY provided – running in MOCK mode.");
}

/**
 * MAIN FUNCTION
 * Returns real GPT analysis if available.
 * Returns realistic synthetic mock analysis otherwise.
 */
async function analyzeWorkability(githubSignals) {
  if (!openai) {
    return buildMockAnalysis(githubSignals, true);
  }

  const systemPrompt = `
You are an expert engineering manager and hiring manager.

You will receive aggregated GitHub data about a developer.
You must output a STRICT JSON object with the following schema:

{
  "workabilityScore": number,
  "experienceLevel": string,
  "workStyle": string,
  "topSkills": [
    {
      "name": string,
      "level": string,
      "confidence": number,
      "evidence": string
    }
  ],
  "topRoles": [
    {
      "title": string,
      "fitScore": number,
      "notes": string
    }
  ],
  "strengths": string[],
  "risks": string[],
  "recommendations": string[]
}

Return ONLY valid JSON. No markdown, no explanation.
`;

  const userContent = {
    type: "json",
    githubSignals
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini", // upgrade to gpt-4.1 / gpt-4.1-pro if your plan supports it
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify(userContent)
        }
      ]
    });

    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content);

    return {
      ...parsed,
      isMock: false
    };
  } catch (err) {
    console.error("[AI] OpenAI error, falling back to mock:", err.message);
    return buildMockAnalysis(githubSignals, true);
  }
}

/**
 * HIGH-QUALITY REALISTIC MOCK AI
 * Creates unique synthetic output using real GitHub signals.
 */
function buildMockAnalysis(githubSignals, isMock = false) {
  const { stats = {}, languages = [], userProfile = {}, repos = [] } = githubSignals;

  const primaryLang = languages[0]?.lang || "JavaScript";
  const repoCount = stats.repoCount || repos.length || 0;
  const followers = stats.followers || userProfile.followers || 0;

  // Approximate "total commits" if not supplied
  const totalCommits =
    stats.totalCommits ||
    Math.round((repoCount || 0) * 20 + (stats.recentActiveRepos || 0) * 15);

  const topLangs = languages.slice(1, 4).map((l) => l.lang);

  // ------------------------------------
  // 1. BUILD REALISTIC SCORE
  // ------------------------------------
  let score = 50;

  score += Math.min(20, followers / 5);       // 0–20
  score += Math.min(10, repoCount / 3);       // 0–10
  score += Math.min(20, totalCommits / 50);   // 0–20

  if (totalCommits > 500) score += 5;
  if (totalCommits > 1000) score += 5;

  if (score > 95) score = 95;
  if (score < 40) score = 40;

  // ------------------------------------
  // 2. INFER EXPERIENCE LEVEL
  // ------------------------------------
  let experienceLevel = "Junior";
  if (totalCommits > 800) experienceLevel = "Senior";
  else if (totalCommits > 250) experienceLevel = "Mid-level";

  // ------------------------------------
  // 3. WORK STYLE
  // ------------------------------------
  const styleTemplates = [
    `Shows consistent growth with a steady commit pattern and focus on ${primaryLang}.`,
    `Demonstrates curiosity through diverse small projects and regular experimentation.`,
    `Appears pragmatic, prioritizing working prototypes and incremental improvement.`,
    `Seems collaborative with code structured cleanly across several repositories.`,
    `Shows signs of disciplined engineering habits with frequent commit bursts.`
  ];

  const indexSeed = (followers + repoCount + totalCommits) || 0;
  const workStyle =
    styleTemplates[indexSeed % styleTemplates.length];

  // ------------------------------------
  // 4. TOP SKILLS
  // ------------------------------------
  const topSkills = [];

  topSkills.push({
    name: primaryLang,
    level:
      totalCommits > 800
        ? "advanced"
        : totalCommits > 250
        ? "intermediate"
        : "beginner",
    confidence: 0.85,
    evidence: `Primary language across ${
      repoCount || "multiple"
    } repositories and dominant in commit activity.`
  });

  topSkills.push({
    name: "Git & Version Control",
    level: "intermediate",
    confidence: 0.9,
    evidence: `Commit history indicates frequent commits across different projects.`
  });

  if (topLangs.length > 0) {
    topSkills.push({
      name: topLangs[0],
      level: "beginner",
      confidence: 0.6,
      evidence: `Appears in secondary repositories and experimental work.`
    });
  }

  // ------------------------------------
  // 5. TOP ROLES
  // ------------------------------------
  const topRoles = [
    {
      title: `${primaryLang} Developer`,
      fitScore: score,
      notes: `Good alignment based on repo activity, language usage and approximate commit volume.`
    },
    {
      title: "Full-Stack Developer",
      fitScore: score - 5,
      notes: `Could be suited depending on backend / infra exposure.`
    }
  ];

  // ------------------------------------
  // 6. STRENGTHS
  // ------------------------------------
  const strengths = [
    `Consistent work with ${primaryLang}.`,
    followers > 20
      ? "Has visible developer presence with a growing follower base."
      : "Shows learning in public through open repositories.",
    repoCount > 10
      ? "Maintains a diverse set of repositories."
      : "Focuses on a smaller set of core projects.",
    totalCommits > 300
      ? "Commit volume suggests strong iteration habits."
      : "Gradually increasing commit activity over time."
  ];

  // ------------------------------------
  // 7. RISKS
  // ------------------------------------
  const risks = [];

  if (repoCount < 3) risks.push("Limited repository history available.");
  if (followers < 5) risks.push("Low social proof and community visibility.");
  if (totalCommits < 100) risks.push("Shallow commit history; depth of experience unclear.");

  risks.push("Mock analysis: skill depth not validated using real AI.");

  // ------------------------------------
  // 8. RECOMMENDATIONS
  // ------------------------------------
  const recommendations = [
    "Add clear README files with project goals and architecture decisions.",
    "Pin 2–3 flagship repositories that best demonstrate capabilities.",
    "Contribute to open-source to showcase collaboration and review skills.",
    "Introduce tests and CI workflows to demonstrate engineering maturity."
  ];

  return {
    workabilityScore: Math.round(score),
    experienceLevel,
    workStyle,
    topSkills,
    topRoles,
    strengths,
    risks,
    recommendations,
    isMock
  };
}

module.exports = {
  analyzeWorkability
};
