const STACK = [
  ['react native', 16], ['next.js', 15], ['nextjs', 15], ['node.js', 15], ['nodejs', 15],
  ['react', 13], ['typescript', 11], ['javascript', 10], ['remix', 13], ['shopify', 12],
  ['postgresql', 10], ['postgres', 10], ['sql server', 9], ['mysql', 8], ['mongodb', 8],
  ['graphql', 9], ['rest api', 8], ['restful', 8], ['redis', 7], ['docker', 6], ['python', 4]
];
const ROLE = /full[ -]?stack|software (?:developer|engineer)|web developer|frontend|front-end|backend|back-end|react|node|javascript|typescript|shopify|mobile|react native/i;
const HARD_IRRELEVANT = /sales|marketing|recruiter|designer|customer support|data scientist|devops|site reliability|qa engineer|product manager/i;

function yearsRequired(text) {
  const matches = [...text.matchAll(/(\d+)\+?\s*(?:-|to\s*\d+\s*)?years?/gi)].map(m => Number(m[1]));
  return matches.length ? Math.min(...matches) : 0;
}

function scoreJob(job) {
  const title = job.title || '';
  const text = `${title} ${job.skills || ''} ${job.description || ''}`.toLowerCase();
  if (!ROLE.test(title) || HARD_IRRELEVANT.test(title)) return 0;
  let score = 18;
  const matchedSkills = [];
  for (const [skill, points] of STACK) {
    if (text.includes(skill) && !matchedSkills.some(found => found.includes(skill) || skill.includes(found))) {
      score += points; matchedSkills.push(skill);
    }
  }
  if (/junior|entry|graduate|associate|intern/i.test(title)) score += 12;
  if (/senior|staff|principal|lead|manager|head/i.test(title)) score -= 20;
  const requiredYears = yearsRequired(text);
  if (requiredYears >= 5) score -= 22;
  else if (requiredYears >= 3) score -= 10;
  const ageDays = job.publishedAt ? (Date.now() - new Date(job.publishedAt).getTime()) / 86400000 : 30;
  if (ageDays <= 7) score += 8; else if (ageDays <= 30) score += 4; else if (ageDays > 90) score -= 15;
  return Math.max(0, Math.min(100, score));
}

function rankedJobs(jobs) {
  return jobs
    .map(job => ({ ...job, matchScore: scoreJob(job) }))
    .filter(job => job.matchScore >= 22)
    .sort((a, b) => b.matchScore - a.matchScore || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
}

module.exports = { scoreJob, rankedJobs };
