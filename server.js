const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { PDFParse } = require('pdf-parse');
const { fetchLiveJobs, validateLiveUrls } = require('./job-sources');
const { rankedJobs } = require('./matcher');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const CV_DIR = path.join(DATA_DIR, 'cv');

const initialData = {
  profile: { fullName: '', email: '', cvSummary: '', cvFileName: '', github: '', linkedin: '', portfolio: '', answers: {} },
  jobs: [],
  applications: [],
  jobSearch: { lastRefreshedAt: null, lastError: null, sourceErrors: [], rawCount: 0, matchedCount: 0 },
  settings: { dailyApplicationLimit: 5, reviewRequired: true, timezone: 'Asia/Karachi', remoteOnly: true, language: 'English' }
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CV_DIR)) fs.mkdirSync(CV_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}
function readStore() {
  ensureStore();
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  return {
    ...initialData,
    ...saved,
    profile: { ...initialData.profile, ...(saved.profile || {}) },
    settings: { ...initialData.settings, ...(saved.settings || {}) },
    jobSearch: { ...initialData.jobSearch, ...(saved.jobSearch || {}) }
  };
}
function writeStore(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.on('data', chunk => { text += chunk; if (text.length > 1_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(text ? JSON.parse(text) : {}); } catch { reject(new Error('Invalid JSON')); } });
  });
}
function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let total = 0;
    req.on('data', chunk => { total += chunk.length; if (total > 8_000_000) { reject(new Error('PDF must be smaller than 8 MB.')); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
function readMultipartFile(buffer, contentType) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) throw new Error('Missing upload boundary.');
  const marker = Buffer.from(`--${boundary}`); const start = buffer.indexOf(marker);
  const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), start);
  if (headerEnd < 0) throw new Error('Invalid upload.');
  const header = buffer.subarray(start, headerEnd).toString('utf8');
  const filename = header.match(/filename="([^"]+)"/i)?.[1];
  const end = buffer.indexOf(marker, headerEnd + 4);
  if (!filename || end < 0) throw new Error('No PDF file was provided.');
  return { filename: path.basename(filename), data: buffer.subarray(headerEnd + 4, end - 2) };
}
function eligibleJobs(store) {
  const today = new Date().toISOString().slice(0, 10);
  const alreadyQueued = new Set(store.applications.map(a => a.jobId));
  return rankedJobs(store.jobs)
    .filter(j => j.english !== false && !alreadyQueued.has(j.id) && (!j.deadline || j.deadline >= today));
}
async function refreshJobs() {
  const store = readStore();
  try {
    const result = await fetchLiveJobs();
    const matches = await validateLiveUrls(rankedJobs(result.jobs));
    const existingIds = new Map(store.jobs.filter(job => job.externalId).map(job => [job.externalId, job.id]));
    const linkedIds = new Set(store.applications.map(application => application.jobId));
    const preserved = store.jobs.filter(job => job.source === 'Manual' || linkedIds.has(job.id));
    const fetched = matches.map(job => ({
      ...job,
      id: existingIds.get(job.externalId) || randomUUID(),
      english: true,
      createdAt: new Date().toISOString()
    }));
    const fetchedIds = new Set(fetched.map(job => job.externalId));
    store.jobs = [...preserved.filter(job => !job.externalId || !fetchedIds.has(job.externalId)), ...fetched];
    store.jobSearch = {
      lastRefreshedAt: new Date().toISOString(),
      lastError: null,
      sourceErrors: result.errors,
      rawCount: result.jobs.length,
      matchedCount: fetched.length
    };
    writeStore(store);
    return store.jobSearch;
  } catch (error) {
    store.jobSearch = { ...store.jobSearch, lastError: error.message };
    writeStore(store);
    throw error;
  }
}
function makeEmailDraft(profile, job) {
  const firstName = (profile.fullName || 'Taha Akber').split(/\s+/)[0];
  return {
    to: job.applicationEmail,
    subject: `Application for ${job.title} - ${profile.fullName || 'Taha Akber'}`,
    body: `Hello ${job.company} hiring team,\n\nI am applying for the ${job.title} position. I currently build full-stack applications using React, Next.js, Remix and Node.js, including REST/GraphQL integrations and PostgreSQL, MySQL and SQL Server databases. I also have experience with React Native and Shopify applications.\n\nMy CV is attached for your review. You can also see my work here:\nGitHub: ${profile.github || ''}\nLinkedIn: ${profile.linkedin || ''}\nPortfolio: ${profile.portfolio || ''}\n\nThank you for your time.\n\nBest regards,\n${profile.fullName || firstName}`
  };
}
async function api(req, res, url) {
  const store = readStore();
  if (req.method === 'GET' && url.pathname === '/api/state') {
    return send(res, 200, { ...store, recommendedJobs: eligibleJobs(store) });
  }
  if (req.method === 'POST' && url.pathname === '/api/jobs/refresh') {
    const result = await refreshJobs();
    const updated = readStore();
    return send(res, 200, { ...result, recommendedCount: eligibleJobs(updated).length });
  }
  if (req.method === 'PUT' && url.pathname === '/api/profile') {
    store.profile = { ...store.profile, ...(await body(req)) }; writeStore(store); return send(res, 200, store.profile);
  }
  if (req.method === 'POST' && url.pathname === '/api/profile/cv') {
    const upload = readMultipartFile(await rawBody(req), req.headers['content-type'] || '');
    if (!upload.filename.toLowerCase().endsWith('.pdf') || upload.data.subarray(0, 4).toString() !== '%PDF') return send(res, 400, { error: 'Please upload a valid PDF.' });
    const savedName = `${Date.now()}-${upload.filename.replace(/[^a-z0-9._-]/gi, '_')}`;
    fs.writeFileSync(path.join(CV_DIR, savedName), upload.data);
    const parser = new PDFParse({ data: upload.data });
    const result = await parser.getText();
    await parser.destroy();
    const extracted = (result.text || '').replace(/\s{3,}/g, '\n').trim();
    if (!extracted) return send(res, 422, { error: 'No selectable text was found in this PDF. Please use a text-based PDF.' });
    store.profile.cvSummary = extracted; store.profile.cvFileName = upload.filename; writeStore(store);
    return send(res, 200, { fileName: upload.filename, extractedCharacters: extracted.length, cvSummary: extracted });
  }
  if (req.method === 'PUT' && url.pathname === '/api/settings') {
    store.settings = { ...store.settings, ...(await body(req)) }; writeStore(store); return send(res, 200, store.settings);
  }
  if (req.method === 'POST' && url.pathname === '/api/jobs') {
    const job = await body(req);
    if (!job.title || !job.company || !job.url || !job.country) return send(res, 400, { error: 'title, company, country and url are required.' });
    const saved = { id: randomUUID(), title: job.title, company: job.company, country: job.country, url: job.url, description: job.description || '', skills: job.skills || '', english: job.english !== false, source: job.source || 'Manual', createdAt: new Date().toISOString() };
    store.jobs.unshift(saved); writeStore(store); return send(res, 201, saved);
  }
  if (req.method === 'POST' && url.pathname === '/api/applications') {
    const { jobId, note = '' } = await body(req);
    const job = store.jobs.find(j => j.id === jobId);
    if (!job) return send(res, 404, { error: 'Job not found.' });
    if (store.applications.some(a => a.jobId === jobId)) return send(res, 409, { error: 'Already in application queue.' });
    const application = { id: randomUUID(), jobId, status: 'ready_for_review', note, emailDraft: null, createdAt: new Date().toISOString(), approvedAt: null, submittedAt: null };
    store.applications.unshift(application); writeStore(store); return send(res, 201, application);
  }
  const draftMatch = url.pathname.match(/^\/api\/applications\/([\w-]+)\/email-draft$/);
  if (req.method === 'POST' && draftMatch) {
    const application = store.applications.find(a => a.id === draftMatch[1]);
    const job = application && store.jobs.find(j => j.id === application.jobId);
    if (!application || !job) return send(res, 404, { error: 'Application not found.' });
    if (!job.applicationEmail) return send(res, 409, { error: 'This listing does not publish an application email. Use its official application link.' });
    application.emailDraft = makeEmailDraft(store.profile, job);
    writeStore(store); return send(res, 200, application.emailDraft);
  }
  const applicationMatch = url.pathname.match(/^\/api\/applications\/([\w-]+)\/(approve|submit)$/);
  if (req.method === 'POST' && applicationMatch) {
    const application = store.applications.find(a => a.id === applicationMatch[1]);
    if (!application) return send(res, 404, { error: 'Application not found.' });
    const action = applicationMatch[2];
    if (action === 'approve') { application.status = 'approved'; application.approvedAt = new Date().toISOString(); }
    if (action === 'submit') {
      if (store.settings.reviewRequired && application.status !== 'approved') return send(res, 409, { error: 'Approval is required before submission.' });
      application.status = 'submitted'; application.submittedAt = new Date().toISOString();
    }
    writeStore(store); return send(res, 200, application);
  }
  return send(res, 404, { error: 'Not found.' });
}
function serveStatic(req, res, pathname) {
  const publicAsset = ['/app.js', '/styles.css'].includes(pathname) ? `/public${pathname}` : pathname;
  const requested = pathname === '/' ? '/public/index.html' : publicAsset;
  const target = path.normalize(path.join(ROOT, requested));
  if (!target.startsWith(ROOT) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  const ext = path.extname(target); const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }); fs.createReadStream(target).pipe(res);
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else serveStatic(req, res, url.pathname); }
  catch (error) { send(res, 500, { error: error.message || 'Unexpected server error.' }); }
});
server.listen(PORT, () => {
  console.log(`Job assistant running at http://localhost:${PORT}`);
  refreshJobs().then(result => console.log(`Live jobs refreshed: ${result.matchedCount} matches`)).catch(error => console.error(`Job refresh failed: ${error.message}`));
});
setInterval(() => refreshJobs().catch(error => console.error(`Scheduled refresh failed: ${error.message}`)), 24 * 60 * 60 * 1000).unref();
