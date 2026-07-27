function profileHints(text = '') {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const phoneCandidates = text.match(/(?:\+\d{1,3}[\s().-]*)?(?:\d[\s().-]*){9,14}/g) || [];
  const phone = phoneCandidates
    .map(value => value.trim())
    .find(value => value.replace(/\D/g, '').length >= 10) || '';
  const fullName = lines.find(line =>
    /^[A-Za-z][A-Za-z .'-]{2,60}$/.test(line)
    && line.split(/\s+/).length >= 2
    && line.split(/\s+/).length <= 5
  ) || '';
  const currentLocation = lines.find(line =>
    /\bpakistan\b/i.test(line)
    && line.length <= 140
    && !/experience|developer|engineer|education/i.test(line)
  ) || '';
  return { fullName, email, phone, currentLocation };
}

module.exports = { profileHints };
