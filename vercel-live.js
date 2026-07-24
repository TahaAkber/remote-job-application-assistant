const { createHash } = require('crypto');
const { fetchLiveJobs, validateLiveUrls } = require('./job-sources');
const { rankedJobs } = require('./matcher');

let cached = null;
let cachedAt = 0;

async function liveState(force = false) {
  if (!force && cached && Date.now() - cachedAt < 30 * 60 * 1000) return cached;
  const result = await fetchLiveJobs();
  const matches = await validateLiveUrls(rankedJobs(result.jobs));
  const jobs = matches.map(job => ({
    ...job,
    id: createHash('sha256').update(job.externalId || job.url).digest('hex').slice(0, 24),
    english: true,
    createdAt: new Date().toISOString()
  }));
  cached = {
    storageMode: 'browser',
    profile: {},
    settings: { dailyApplicationLimit: 5, reviewRequired: true, remoteOnly: true, language: 'English' },
    applications: [],
    jobs,
    recommendedJobs: jobs,
    jobSearch: {
      lastRefreshedAt: new Date().toISOString(),
      lastError: null,
      sourceErrors: result.errors,
      rawCount: result.jobs.length,
      matchedCount: jobs.length
    }
  };
  cachedAt = Date.now();
  return cached;
}

module.exports = { liveState };
