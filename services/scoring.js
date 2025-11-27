function computeFitLevel(score) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Moderate";
  if (score >= 40) return "Weak";
  return "Poor";
}

function scoreCandidate(signals, job) {
  const { primary_languages, stars_total, repo_count, recent_commit_velocity } = signals;

  let score = 0;
  let highlights = [];
  let risks = [];

  /* ------------------------------
     TECH MATCH (Must-have)
  ------------------------------ */

  const langs = primary_languages.map(l => l.name.toLowerCase());

  let matchedMust = 0;
  job.stackMust.forEach((tech) => {
    if (langs.includes(tech.toLowerCase())) {
      matchedMust++;
      score += 15;
      highlights.push(`Strong match for required skill: ${tech}`);
    } else {
      risks.push(`Missing required skill: ${tech}`);
    }
  });

  /* ------------------------------
     TECH MATCH (Nice-to-have)
  ------------------------------ */
  job.stackNice.forEach((tech) => {
    if (langs.includes(tech.toLowerCase())) {
      score += 7;
      highlights.push(`Good match for preferred skill: ${tech}`);
    }
  });

  /* ------------------------------
     SENIORITY MATCH
  ------------------------------ */
  if (stars_total >= 50 || repo_count >= 15) {
    score += 15;
    highlights.push("Senior-level project exposure");
  }

  /* ------------------------------
     ACTIVITY
  ------------------------------ */
  if (recent_commit_velocity >= 15) {
    score += 15;
    highlights.push("Strong recent GitHub activity");
  } else {
    risks.push("Low recent GitHub activity");
  }

  /* ------------------------------ */

  score = Math.min(score, 100);
  const fit = computeFitLevel(score);

  return {
    score,
    fit,
    highlights,
    risks,
    explanation: `This candidate matches ${matchedMust} required skills and shows ${fit} alignment with the role.`
  };
}

module.exports = { scoreCandidate };
