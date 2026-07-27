const USER_AGENT = 'TahaJobAssistant/1.0 (+local personal job search)';

function decodeXml(value = '') {
  return String(value)
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function cleanHtml(value = '') {
  return decodeXml(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function xmlValue(item, tag) {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = item.match(new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, 'i'));
  return decodeXml(match?.[1] || '').trim();
}

function rssItems(xml) {
  return [...String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
}

function applicationEmail(description = '') {
  const text = cleanHtml(description);
  const emails = [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)];
  for (const match of emails) {
    const nearby = text.slice(Math.max(0, match.index - 140), match.index + match[0].length + 140);
    if (/apply|application|send.{0,30}(?:cv|resume)|(?:cv|resume).{0,30}(?:to|at)/i.test(nearby)) return match[0].toLowerCase();
  }
  return '';
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  return response.json();
}

async function getText(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml;q=0.9' },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
      return response.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function fromWeWorkRemotely(item) {
  const combinedTitle = cleanHtml(xmlValue(item, 'title'));
  const separator = combinedTitle.indexOf(':');
  const company = separator > 0 ? combinedTitle.slice(0, separator).trim() : 'Company shown on listing';
  const title = separator > 0 ? combinedTitle.slice(separator + 1).trim() : combinedTitle;
  const descriptionHtml = xmlValue(item, 'description');
  const url = xmlValue(item, 'link') || xmlValue(item, 'guid');
  return {
    externalId: `wwr:${xmlValue(item, 'guid') || url}`,
    title,
    company,
    country: cleanHtml(xmlValue(item, 'region') || xmlValue(item, 'country')) || 'Remote / check listing',
    url,
    description: cleanHtml(descriptionHtml),
    skills: cleanHtml(xmlValue(item, 'skills') || xmlValue(item, 'category')),
    source: 'We Work Remotely',
    sourceUrl: 'https://weworkremotely.com/',
    remote: true,
    publishedAt: xmlValue(item, 'pubDate') || null,
    employmentType: cleanHtml(xmlValue(item, 'type')),
    applicationEmail: applicationEmail(descriptionHtml)
  };
}

function fromJobspresso(item) {
  const descriptionHtml = xmlValue(item, 'content:encoded') || xmlValue(item, 'description');
  const url = xmlValue(item, 'link');
  return {
    externalId: `jobspresso:${xmlValue(item, 'guid') || url}`,
    title: cleanHtml(xmlValue(item, 'title')),
    company: cleanHtml(xmlValue(item, 'job_listing:company')) || 'Company shown on listing',
    country: cleanHtml(xmlValue(item, 'job_listing:location')) || 'Remote / check listing',
    url,
    description: cleanHtml(descriptionHtml),
    skills: [
      cleanHtml(xmlValue(item, 'job_listing:job_type')),
      cleanHtml(xmlValue(item, 'job_listing:job_category'))
    ].filter(Boolean).join(', '),
    source: 'Jobspresso',
    sourceUrl: 'https://jobspresso.co/remote-work/',
    remote: true,
    publishedAt: xmlValue(item, 'pubDate') || null,
    employmentType: cleanHtml(xmlValue(item, 'job_listing:job_category')),
    applicationEmail: applicationEmail(descriptionHtml)
  };
}

function fromRemotive(job) {
  const description = cleanHtml(job.description);
  return {
    externalId: `remotive:${job.id}`,
    title: job.title,
    company: job.company_name,
    country: job.candidate_required_location || 'Remote',
    url: job.url,
    description,
    skills: (job.tags || []).join(', '),
    source: 'Remotive',
    sourceUrl: 'https://remotive.com/remote-jobs',
    remote: true,
    publishedAt: job.publication_date || null,
    employmentType: job.job_type || '',
    applicationEmail: applicationEmail(job.description)
  };
}

function fromArbeitnow(job) {
  const description = cleanHtml(job.description);
  return {
    externalId: `arbeitnow:${job.slug}`,
    title: job.title,
    company: job.company_name,
    country: job.location || 'Remote',
    url: job.url,
    description,
    skills: (job.tags || []).join(', '),
    source: 'Arbeitnow',
    sourceUrl: 'https://www.arbeitnow.com/',
    remote: Boolean(job.remote),
    publishedAt: job.created_at ? new Date(Number(job.created_at) * 1000).toISOString() : null,
    employmentType: (job.job_types || []).join(', '),
    applicationEmail: applicationEmail(job.description)
  };
}

function fromRemoteOk(job) {
  const description = cleanHtml(job.description);
  return {
    externalId: `remoteok:${job.id}`,
    title: job.position,
    company: job.company,
    country: job.location || 'Remote worldwide / check listing',
    url: job.apply_url || job.url,
    description,
    skills: (job.tags || []).join(', '),
    source: 'RemoteOK',
    sourceUrl: 'https://remoteok.com/',
    remote: true,
    publishedAt: job.date || (job.epoch ? new Date(Number(job.epoch) * 1000).toISOString() : null),
    employmentType: (job.tags || []).includes('full time') ? 'Full time' : '',
    applicationEmail: applicationEmail(job.description)
  };
}

function fromHimalayas(job) {
  const description = cleanHtml(job.description);
  return {
    externalId: `himalayas:${job.guid || job.applicationLink}`,
    title: job.title,
    company: job.companyName,
    country: (job.locationRestrictions || []).join(', ') || 'Remote worldwide / check listing',
    url: job.applicationLink || job.guid,
    description,
    skills: [...(job.categories || []), ...(job.parentCategories || [])].join(', '),
    source: 'Himalayas',
    sourceUrl: 'https://himalayas.app/jobs',
    remote: true,
    publishedAt: job.pubDate ? new Date(Number(job.pubDate) * 1000).toISOString() : null,
    deadline: job.expiryDate ? new Date(Number(job.expiryDate) * 1000).toISOString().slice(0, 10) : null,
    employmentType: job.employmentType || '',
    applicationEmail: applicationEmail(job.description)
  };
}

function fromJobicy(job) {
  const description = cleanHtml(job.jobDescription || job.jobExcerpt);
  return {
    externalId: `jobicy:${job.id}`,
    title: job.jobTitle,
    company: job.companyName,
    country: job.jobGeo || 'Remote / check listing',
    url: job.url,
    description,
    skills: [...(job.jobIndustry || []), ...(job.jobType || []), job.jobLevel || ''].filter(Boolean).join(', '),
    source: 'Jobicy',
    sourceUrl: 'https://jobicy.com/',
    remote: true,
    publishedAt: job.pubDate || null,
    employmentType: (job.jobType || []).join(', '),
    applicationEmail: applicationEmail(job.jobDescription)
  };
}

async function fetchRemotive() {
  const searches = ['react', 'node', 'full stack', 'next.js', 'react native', 'shopify'];
  const results = await Promise.all(searches.map(term => getJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(term)}`)));
  return results.flatMap(result => result.jobs || []).map(fromRemotive);
}

async function fetchArbeitnow() {
  const pages = await Promise.all([1, 2, 3].map(page => getJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`)));
  return pages.flatMap(result => result.data || []).filter(job => job.remote).map(fromArbeitnow);
}

async function fetchRemoteOk() {
  const result = await getJson('https://remoteok.com/api');
  return (result || []).filter(job => job && job.id && job.position && job.url).map(fromRemoteOk);
}

async function fetchHimalayas() {
  const result = await getJson('https://himalayas.app/jobs/api?limit=100');
  return (result.jobs || []).map(fromHimalayas);
}

async function fetchJobicy() {
  const tags = ['javascript', 'react', 'nodejs', 'full-stack', 'sql', 'shopify'];
  const results = await Promise.all(tags.map(tag => getJson(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(tag)}`)));
  return results.flatMap(result => result.jobs || []).map(fromJobicy);
}

async function fetchWeWorkRemotely() {
  const xml = await getText('https://weworkremotely.com/categories/remote-programming-jobs.rss');
  return rssItems(xml).map(fromWeWorkRemotely).filter(job => job.title && job.url);
}

async function fetchJobspresso() {
  const xml = await getText('https://jobspresso.co/?feed=job_feed&job_types=developer');
  return rssItems(xml).map(fromJobspresso).filter(job => job.title && job.url);
}

async function fetchLiveJobs() {
  const sources = [
    ['Remotive', fetchRemotive],
    ['Arbeitnow', fetchArbeitnow],
    ['RemoteOK', fetchRemoteOk],
    ['Himalayas', fetchHimalayas],
    ['Jobicy', fetchJobicy],
    ['We Work Remotely', fetchWeWorkRemotely],
    ['Jobspresso', fetchJobspresso]
  ];
  const settled = await Promise.allSettled(sources.map(([, load]) => load()));
  const jobs = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const errors = settled.flatMap((result, index) => result.status === 'rejected'
    ? [`${sources[index][0]}: ${result.reason.message}`]
    : []);
  if (!jobs.length) throw new Error(`All job sources failed${errors.length ? `: ${errors.join('; ')}` : ''}`);
  const unique = new Map();
  for (const job of jobs) {
    const key = job.url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
    if (!unique.has(key)) unique.set(key, job);
  }
  return { jobs: [...unique.values()], errors };
}

async function validateLiveUrls(jobs) {
  return (await Promise.all(jobs.map(async job => {
    try {
      const response = await fetch(job.url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10000)
      });
      if (response.status === 404 || response.status === 410) return null;
      return { ...job, linkStatus: response.ok || response.status === 401 || response.status === 403 ? 'live' : 'unverified', linkCheckedAt: new Date().toISOString() };
    } catch {
      return { ...job, linkStatus: 'unverified', linkCheckedAt: new Date().toISOString() };
    }
  }))).filter(Boolean);
}

module.exports = { fetchLiveJobs, validateLiveUrls, cleanHtml };
