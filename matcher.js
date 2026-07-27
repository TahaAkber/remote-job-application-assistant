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

function compactSkill(value = '') {
  return value.toLowerCase().replace(/[\s.-]+/g, '');
}

function containsSkill(text, skill) {
  return text.includes(skill) || compactSkill(text).includes(compactSkill(skill));
}

function overlapsSkill(first, second) {
  const a = compactSkill(first);
  const b = compactSkill(second);
  return a.includes(b) || b.includes(a);
}

function locationEligible(job, cvText = '') {
  if (!/\bpakistan\b/i.test(cvText)) return true;
  const country = (job.country || '').trim();
  const restricted = /\bunited states\b|\busa\b|\bu\.s\.\b|\bcanada\b|\beurope\b|\beu\b|\bunited kingdom\b|\buk\b|\blatam\b|latin america|\bbrazil\b|\bgermany\b|\bfrance\b|\bpoland\b|\baustralia\b|\bnew zealand\b|\bindia\b|\bphilippines\b/i;
  if (/\bpakistan\b|anywhere in the world|worldwide|global|work from anywhere|\basia\b|no location restriction/i.test(country)) return true;
  if (restricted.test(country)) return false;
  if (!country || /remote\s*(?:\/|-)?\s*(?:check listing)?$/i.test(country)) return true;
  const summary = (job.description || '').slice(0, 900);
  if (/\bpakistan\b|anywhere in the world|worldwide|global|work from anywhere|\basia\b|no location restriction/i.test(summary)) return true;
  return !restricted.test(summary);
}

function cvStack(cvText = '') {
  const normalized = cvText.toLowerCase();
  if (!normalized.trim()) return STACK;
  const found = STACK.filter(([skill]) => containsSkill(normalized, skill));
  return found.length ? found : STACK;
}

function scoreJob(job, cvText = '') {
  const title = job.title || '';
  const text = `${title} ${job.skills || ''} ${job.description || ''}`.toLowerCase();
  if (!ROLE.test(title) || HARD_IRRELEVANT.test(title)) return 0;
  let score = 18;
  const matchedSkills = [];
  for (const [skill, points] of cvStack(cvText)) {
    if (containsSkill(text, skill) && !matchedSkills.some(found => overlapsSkill(found, skill))) {
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

function rankedJobs(jobs, cvText = '') {
  return jobs
    .map(job => {
      const matchScore = scoreJob(job, cvText);
      const text = `${job.title || ''} ${job.skills || ''} ${job.description || ''}`.toLowerCase();
      const matchedSkills = cvStack(cvText)
        .map(([skill]) => skill)
        .filter(skill => containsSkill(text, skill))
        .filter((skill, index, all) => !all.some((other, otherIndex) => otherIndex < index && overlapsSkill(other, skill)))
        .slice(0, 6);
      return { ...job, matchScore, matchedSkills, locationEligible: locationEligible(job, cvText) };
    })
    .filter(job => job.matchScore >= 22 && job.locationEligible)
    .sort((a, b) => b.matchScore - a.matchScore || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
}

module.exports = { scoreJob, rankedJobs };
