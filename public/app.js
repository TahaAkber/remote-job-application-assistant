let state = {};
let visibleCount = 40;
const LOCAL_KEY = 'taha-job-assistant-state-v1';
const $ = (selector, root = document) => root.querySelector(selector);

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function escapeHtml(value = '') { const element = document.createElement('div'); element.textContent = value; return element.innerHTML; }
function formatDate(value) { return value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Date not supplied'; }
function localData() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch { return {}; } }
function saveLocal() { localStorage.setItem(LOCAL_KEY, JSON.stringify({ profile: state.profile, settings: state.settings, applications: state.applications })); }
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitForAutofillReport(applicationId, runId) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    await wait(1500);
    const result = await request(`/api/applications/${applicationId}/autofill?runId=${encodeURIComponent(runId)}`);
    if (!result.pending) return result.report;
  }
  throw new Error('Autofill is still running. Check the open browser for a login or verification step.');
}
async function waitForBatchReports(runId, expectedCount, onProgress) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    await wait(1500);
    const result = await request(`/api/applications/autofill-batch?runId=${encodeURIComponent(runId)}`);
    onProgress(result.reports.length);
    if (result.reports.length >= expectedCount) return result.reports;
  }
  throw new Error('Batch autofill is still running. Check the open browser for a login or verification step.');
}
function clientEmailDraft(profile, job) {
  return {
    to: job.applicationEmail,
    subject: `Application for ${job.title} - ${profile.fullName || 'Taha Akber'}`,
    body: `Hello ${job.company} hiring team,\n\nI am applying for the ${job.title} position. I build full-stack applications with React, Next.js, Remix and Node.js, including REST/GraphQL integrations and PostgreSQL, MySQL and SQL Server databases. I also have experience with React Native and Shopify applications.\n\nMy CV is attached for your review.\nGitHub: ${profile.github || ''}\nLinkedIn: ${profile.linkedin || ''}\nPortfolio: ${profile.portfolio || ''}\n\nBest regards,\n${profile.fullName || 'Taha Akber'}`
  };
}
function switchTab(id) {
  document.querySelectorAll('.tab').forEach(element => element.classList.toggle('active', element.id === id));
  document.querySelectorAll('nav button').forEach(element => element.classList.toggle('active', element.dataset.tab === id));
}
function filteredJobs() {
  const term = $('#job-search').value.trim().toLowerCase();
  const source = $('#source-filter').value;
  const queued = new Set((state.applications || []).map(application => application.jobId));
  return (state.recommendedJobs || []).filter(job => {
    const text = `${job.title} ${job.company} ${job.country} ${job.skills} ${job.description}`.toLowerCase();
    return !queued.has(job.id) && (!term || text.includes(term)) && (!source || job.source === source);
  });
}
function renderJobs() {
  const all = filteredJobs();
  const list = $('#recommended'); list.innerHTML = '';
  $('#match-count').textContent = state.recommendedJobs?.length || 0;
  const search = state.jobSearch || {};
  $('#refresh-status').textContent = search.lastError
    ? `Last refresh failed: ${search.lastError}`
    : search.lastRefreshedAt
      ? `${search.rawCount} live listings checked · ${search.matchedCount} CV matches · updated ${new Date(search.lastRefreshedAt).toLocaleString()}`
      : 'Live jobs have not been refreshed yet.';
  if (!all.length) {
    list.innerHTML = '<div class="empty"><h3>No jobs match this filter</h3><p>Clear the filter or refresh the live feeds.</p></div>';
    $('#load-more').classList.add('hidden'); return;
  }
  all.slice(0, visibleCount).forEach(job => {
    const node = $('#job-template').content.cloneNode(true);
    $('.item h3', node).textContent = `${job.title} — ${job.company}`;
    $('.score', node).textContent = `${job.matchScore}% match`;
    const skills = job.matchedSkills?.length ? ` · CV skills: ${job.matchedSkills.join(', ')}` : '';
    $('.meta', node).textContent = `${job.country} · ${job.source} · ${formatDate(job.publishedAt)} · ${job.linkStatus === 'live' ? 'link checked' : 'link not fully verifiable'}${skills}`;
    $('.description', node).textContent = (job.description || '').slice(0, 430) + ((job.description || '').length > 430 ? '…' : '');
    $('.apply-link', node).href = job.url;
    $('.email-available', node).textContent = job.applicationEmail ? `Email application: ${job.applicationEmail}` : '';
    $('.queue-btn', node).onclick = async () => {
      if (state.storageMode === 'browser') {
        state.applications.unshift({ id: crypto.randomUUID(), jobId: job.id, status: 'ready_for_review', emailDraft: null, createdAt: new Date().toISOString() });
        saveLocal(); render();
      } else {
        await request('/api/applications', { method: 'POST', body: JSON.stringify({ jobId: job.id }) }); await load();
      }
      switchTab('queue');
    };
    list.append(node);
  });
  $('#load-more').classList.toggle('hidden', all.length <= visibleCount);
}
function renderQueue() {
  const list = $('#queue-list'); list.innerHTML = '';
  const jobs = Object.fromEntries((state.jobs || []).map(job => [job.id, job]));
  if (!state.applications?.length) { list.innerHTML = '<div class="empty"><h3>Queue is empty</h3><p>Add a suitable live job from the Live jobs tab.</p></div>'; return; }
  state.applications.forEach(application => {
    const job = jobs[application.jobId] || {};
    const row = document.createElement('article'); row.className = 'item queue-card';
    const autofill = state.storageMode === 'browser' || application.status === 'submitted'
      ? ''
      : '<button data-action="autofill" class="secondary-inline">Autofill form</button>';
    const statusAction = application.status === 'ready_for_review'
      ? '<button data-action="approve">Approve after review</button>'
      : application.status === 'approved' && job.applicationEmail
        ? '<button data-action="draft">Prepare email draft</button>'
        : application.status === 'approved'
          ? '<button data-action="submit">Mark portal application submitted</button>'
          : '<span class="done">Submitted</span>';
    const action = `${autofill}${statusAction}`;
    const draft = application.emailDraft ? `<div class="draft"><strong>To:</strong> ${escapeHtml(application.emailDraft.to)}<br><strong>Subject:</strong> ${escapeHtml(application.emailDraft.subject)}<pre>${escapeHtml(application.emailDraft.body)}</pre><button data-copy="true">Copy email draft</button></div>` : '';
    row.innerHTML = `<div class="job-main"><h3>${escapeHtml(job.title || 'Unknown job')} — ${escapeHtml(job.company || '')}</h3><p class="meta">${escapeHtml(job.country || '')} · <span class="status ${application.status}">${application.status.replaceAll('_', ' ')}</span></p><a href="${escapeHtml(job.url || '#')}" target="_blank" rel="noreferrer">Open official listing ↗</a>${draft}</div><div class="queue-actions">${action}</div>`;
    row.querySelectorAll('[data-action]').forEach(actionButton => actionButton.onclick = async () => {
      const actionName = actionButton.dataset.action;
      if (actionName === 'autofill') {
        actionButton.disabled = true;
        try {
          const started = await request(`/api/applications/${application.id}/autofill`, { method: 'POST' });
          actionButton.textContent = 'Finding application form…';
          const report = await waitForAutofillReport(application.id, started.runId);
          if (report.error) throw new Error(report.error);
          actionButton.textContent = report.readyForReview
            ? `Filled (${report.actions.length} actions)`
            : `Needs answers (${report.unknownRequired.length})`;
        } catch (error) {
          actionButton.disabled = false;
          actionButton.textContent = 'Retry autofill';
          actionButton.title = error.message;
          alert(error.message);
        }
        return;
      }
      if (state.storageMode === 'browser') {
        if (actionName === 'approve') application.status = 'approved';
        if (actionName === 'submit') application.status = 'submitted';
        if (actionName === 'draft') application.emailDraft = clientEmailDraft(state.profile || {}, job);
        saveLocal(); render();
      } else {
        if (actionName === 'draft') await request(`/api/applications/${application.id}/email-draft`, { method: 'POST' });
        else await request(`/api/applications/${application.id}/${actionName}`, { method: 'POST' });
        await load();
      }
    });
    const copyButton = $('[data-copy]', row);
    if (copyButton) copyButton.onclick = async () => { await navigator.clipboard.writeText(`${application.emailDraft.subject}\n\n${application.emailDraft.body}`); copyButton.textContent = 'Copied'; };
    list.append(row);
  });
}
function renderProfile() {
  const profile = state.profile || {}; const form = $('#profile-form');
  ['fullName', 'email', 'phone', 'currentLocation', 'noticePeriod', 'salaryExpectation', 'workAuthorization', 'github', 'linkedin', 'portfolio', 'cvSummary']
    .forEach(key => form.elements[key].value = profile[key] || '');
  form.elements.dailyApplicationLimit.value = state.settings?.dailyApplicationLimit || 5;
  if (profile.cvFileName) $('#cv-status').textContent = `${profile.cvFileName} loaded.`;
}
function render() { renderJobs(); renderQueue(); renderProfile(); }
async function load() {
  state = await request('/api/state');
  if (state.storageMode === 'browser') {
    const saved = localData();
    state.profile = saved.profile || state.profile || {};
    state.settings = { ...(state.settings || {}), ...(saved.settings || {}) };
    state.applications = (saved.applications || []).filter(application => state.jobs.some(job => job.id === application.jobId));
  }
  render();
}

document.querySelectorAll('nav button').forEach(button => button.onclick = () => switchTab(button.dataset.tab));
$('#job-search').oninput = () => { visibleCount = 40; renderJobs(); };
$('#source-filter').onchange = () => { visibleCount = 40; renderJobs(); };
$('#load-more').onclick = () => { visibleCount += 40; renderJobs(); };
$('#autofill-queue').onclick = async () => {
  const button = $('#autofill-queue');
  if (state.storageMode === 'browser') return alert('Batch autofill is available in the local app.');
  button.disabled = true;
  try {
    const result = await request('/api/applications/autofill-batch', { method: 'POST' });
    button.textContent = `Processing 0/${result.applicationCount}…`;
    const reports = await waitForBatchReports(result.runId, result.applicationCount, completed => {
      button.textContent = `Processing ${completed}/${result.applicationCount}…`;
    });
    const filled = reports.filter(report => !report.error && report.actions.length).length;
    const blocked = reports.filter(report => report.error).length;
    button.textContent = `Done: ${filled} filled, ${blocked} blocked`;
    if (blocked) alert(reports.filter(report => report.error).map(report => `${report.job}: ${report.error}`).join('\n\n'));
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Autofill all queued forms';
    alert(error.message);
  }
};
$('#queue-top').onclick = async () => {
  const button = $('#queue-top'); button.disabled = true;
  try {
    if (state.storageMode === 'browser') {
      const today = new Date().toISOString().slice(0, 10);
      const usedToday = (state.applications || []).filter(application => application.createdAt?.slice(0, 10) === today).length;
      const remaining = Math.max(0, Number(state.settings?.dailyApplicationLimit || 5) - usedToday);
      const jobs = filteredJobs().slice(0, remaining);
      state.applications.unshift(...jobs.map(job => ({
        id: crypto.randomUUID(), jobId: job.id, status: 'ready_for_review',
        emailDraft: null, createdAt: new Date().toISOString()
      })));
      saveLocal(); render();
    } else {
      await request('/api/applications/batch', { method: 'POST' });
      await load();
    }
    switchTab('queue');
  } catch (error) { alert(error.message); }
  finally { button.disabled = false; }
};
$('#refresh-jobs').onclick = async () => {
  const button = $('#refresh-jobs'); button.disabled = true; button.textContent = 'Refreshing…';
  try { await request('/api/jobs/refresh', { method: 'POST' }); await load(); }
  catch (error) { alert(error.message); }
  finally { button.disabled = false; button.textContent = 'Refresh live jobs'; }
};
$('#cv-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  const status = $('#cv-status'); status.textContent = 'Extracting CV text locally…';
  try {
    const form = new FormData(); form.append('cv', file);
    const response = await fetch('/api/profile/cv', { method: 'POST', body: form }); const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (state.storageMode === 'browser') {
      const hints = Object.fromEntries(Object.entries(data.extractedProfile || {}).filter(([key, value]) => value && !state.profile?.[key]));
      state.profile = { ...(state.profile || {}), ...hints, cvSummary: data.cvSummary, cvFileName: data.fileName };
      saveLocal(); render();
    }
    else await load();
    status.textContent = `${data.fileName} uploaded.`;
  } catch (error) { status.textContent = error.message; }
};
$('#profile-form').onsubmit = async event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  const dailyApplicationLimit = Number(data.dailyApplicationLimit); delete data.dailyApplicationLimit; delete data.cv;
  if (state.storageMode === 'browser') {
    state.profile = { ...(state.profile || {}), ...data };
    state.settings = { ...(state.settings || {}), dailyApplicationLimit };
    saveLocal(); render();
  } else {
    await request('/api/profile', { method: 'PUT', body: JSON.stringify(data) });
    await request('/api/settings', { method: 'PUT', body: JSON.stringify({ dailyApplicationLimit }) });
    await load();
  }
  $('#profile-status').textContent = 'Saved.';
};
$('#copy-profile').onclick = async () => {
  const profile = Object.fromEntries(new FormData($('#profile-form')));
  const reusable = [
    `Full name: ${profile.fullName || ''}`,
    `Email: ${profile.email || ''}`,
    `Phone: ${profile.phone || ''}`,
    `Current location: ${profile.currentLocation || ''}`,
    `Work authorization / eligibility: ${profile.workAuthorization || ''}`,
    `Notice period: ${profile.noticePeriod || ''}`,
    `Salary expectation: ${profile.salaryExpectation || ''}`,
    `GitHub: ${profile.github || ''}`,
    `LinkedIn: ${profile.linkedin || ''}`,
    `Portfolio: ${profile.portfolio || ''}`
  ].join('\n');
  await navigator.clipboard.writeText(reusable);
  $('#profile-status').textContent = 'Reusable answers copied.';
};
load().catch(error => alert(error.message));
