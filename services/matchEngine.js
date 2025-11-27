export function scoreCandidate(candidate, job) {
  let score = 0;
  const highlights = [];
  const risks = [];

  const must = job.stackMust.map(t => t.toLowerCase());
  const nice = job.stackNice.map(t => t.toLowerCase());
  const candidateSkills = candidate.skills.map(s => s.toLowerCase());

  // 🔥 Must-Have Skills (60%)
  const mustMatches = must.filter(m => candidateSkills.includes(m)).length;
  const mustScore = (mustMatches / must.length) * 60;
  score += mustScore;
  if (mustMatches === must.length) highlights.push("Has all must-have skills");
  if (mustMatches < must.length) risks.push("Missing some required technologies");

  // ⭐ Nice-To-Have Skills (20%)
  const niceMatches = nice.filter(n => candidateSkills.includes(n)).length;
  const niceScore = (niceMatches / nice.length) * 20;
  score += niceScore;
  if (niceMatches > 0) highlights.push("Knows several preferred technologies");

  // 🎯 Seniority Match (10%)
  if (candidate.seniority === job.seniority) {
    score += 10;
    highlights.push("Perfect seniority match");
  } else {
    risks.push("Seniority does not fully match");
  }

  // 👨‍💻 Experience Years (10%)
  if (candidate.experienceYears >= job.experienceRequired) {
    score += 10;
    highlights.push("Strong real-world experience");
  } else {
    risks.push("May need more experience for this role");
  }

  // Fit label
  let fitLabel = "Weak";
  if (score >= 80) fitLabel = "Excellent";
  else if (score >= 60) fitLabel = "Strong";
  else if (score >= 40) fitLabel = "Moderate";

  return {
    score: Math.round(score),
    fitLabel,
    highlights,
    risks,
  };
}
