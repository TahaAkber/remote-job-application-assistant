const test = require('node:test');
const assert = require('node:assert/strict');
const { rankedJobs } = require('../matcher');

const profile = `
  Full-stack developer in Karachi, Pakistan.
  React JS, React Native, Next JS, Node JS, PostgreSQL, MySQL and Redis.
`;

test('scores only skills present in both the CV and job', () => {
  const [match] = rankedJobs([{
    title: 'Full Stack React and Node Developer',
    company: 'Example',
    country: 'Anywhere in the World',
    description: 'Build Next.js services with Node.js, PostgreSQL and Docker.'
  }], profile);

  assert.ok(match.matchScore > 50);
  assert.deepEqual(match.matchedSkills.slice(0, 4), ['next.js', 'node.js', 'react', 'postgresql']);
  assert.equal(match.matchedSkills.includes('docker'), false);
});

test('removes clearly location-restricted jobs for a Pakistan-based profile', () => {
  const jobs = rankedJobs([
    {
      title: 'React Developer',
      company: 'Worldwide Co',
      country: 'Anywhere in the World',
      description: 'React and Node.js.'
    },
    {
      title: 'React Developer',
      company: 'US Co',
      country: 'United States only',
      description: 'React and Node.js.'
    }
  ], profile);

  assert.deepEqual(jobs.map(job => job.company), ['Worldwide Co']);
});
