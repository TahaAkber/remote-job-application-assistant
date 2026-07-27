const test = require('node:test');
const assert = require('node:assert/strict');
const { profileHints } = require('../profile-hints');

test('extracts reusable contact fields from CV text', () => {
  const hints = profileHints(`
    Taha Akber
    taha@example.com
    (+92) 346 299 9417
    North Karachi, Karachi, Pakistan
    WORK EXPERIENCE
  `);

  assert.equal(hints.fullName, 'Taha Akber');
  assert.equal(hints.email, 'taha@example.com');
  assert.equal(hints.phone.replace(/\D/g, ''), '923462999417');
  assert.match(hints.currentLocation, /Karachi, Pakistan/);
});
