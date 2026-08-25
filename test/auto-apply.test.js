const test = require('node:test');
const assert = require('node:assert/strict');
const { answerFor, isBlocked, applyCandidateScore } = require('../auto-apply');

const profile = {
  fullName: 'Taha Akber',
  email: 'taha@example.com',
  phone: '+92 300 0000000',
  github: 'https://github.com/taha',
  linkedin: 'https://linkedin.com/in/taha',
  currentLocation: 'Karachi, Pakistan'
};

test('maps common application labels to saved profile values', () => {
  assert.equal(answerFor('first_name', profile), 'Taha');
  assert.equal(answerFor('surname', profile), 'Akber');
  assert.equal(answerFor('email address', profile), 'taha@example.com');
  assert.equal(answerFor('linkedin profile', profile), profile.linkedin);
  assert.equal(answerFor('current location', profile), profile.currentLocation);
});

test('blocks automation on sites whose terms prohibit it', () => {
  assert.equal(isBlocked('https://www.flexjobs.com/job/1'), true);
  assert.equal(isBlocked('https://virtualvocations.com/job/1'), true);
  assert.equal(isBlocked('https://boards.greenhouse.io/example'), false);
});

test('prefers the real apply action and avoids misleading auto-apply/account links', () => {
  assert.ok(applyCandidateScore({ text: 'Apply now', href: '/jobs/123/apply' }) > 50);
  assert.ok(applyCandidateScore({ text: 'continue without an account', href: '#' }) > 100);
  assert.ok(applyCandidateScore({ text: 'AI Auto-Apply', href: '/ai-auto-apply' }) < 0);
  assert.ok(applyCandidateScore({ text: 'Create account & apply', href: '/register' }) < 0);
});
