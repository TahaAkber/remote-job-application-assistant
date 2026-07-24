let state = {};
let visibleCount = 40;
const $ = (selector, root = document) => root.querySelector(selector);

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function escapeHtml(value = '') { const element = document.createElement('div'); element.textContent = value; return element.innerHTML; }
function formatDate(value) { return value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Date not supplied'; }
function switchTab(id) {
  document.querySelectorAll('.tab').forEach(element => element.classList.toggle('active', element.id === id));
  document.querySelectorAll('nav button').forEach(element => element.classList.toggle('active', element.dataset.tab === id));
}
function filteredJobs() {
  const term = $('#job-search').value.trim().toLowerCase();
  const source = $('#source-filter').value;
  return (state.recommendedJobs || []).filter(job => {
    const text = `${job.title} ${job.company} ${job.country} ${job.skills} ${job.description}`.toLowerCase();
    return (!term || text.includes(term)) && (!source || job.source === source);
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
    $('.meta', node).textContent = `${job.country} · ${job.source} · ${formatDate(job.publishedAt)} · ${job.linkStatus === 'live' ? 'link checked' : 'link not fully verifiable'}`;
    $('.description', node).textContent = (job.description || '').slice(0, 430) + ((job.description || '').length > 430 ? '…' : '');
    $('.apply-link', node).href = job.url;
    $('.email-available', node).textContent = job.applicationEmail ? `Email application: ${job.applicationEmail}` : '';
    $('.queue-btn', node).onclick = async () => {
      await request('/api/applications', { method: 'POST', body: JSON.stringify({ jobId: job.id }) });
      await load(); switchTab('queue');
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
    const action = application.status === 'ready_for_review'
      ? '<button data-action="approve">Approve after review</button>'
      : application.status === 'approved' && job.applicationEmail
        ? '<button data-action="draft">Prepare email draft</button>'
        : application.status === 'approved'
          ? '<button data-action="submit">Mark portal application submitted</button>'
          : '<span class="done">Submitted</span>';
    const draft = application.emailDraft ? `<div class="draft"><strong>To:</strong> ${escapeHtml(application.emailDraft.to)}<br><strong>Subject:</strong> ${escapeHtml(application.emailDraft.subject)}<pre>${escapeHtml(application.emailDraft.body)}</pre><button data-copy="true">Copy email draft</button></div>` : '';
    row.innerHTML = `<div class="job-main"><h3>${escapeHtml(job.title || 'Unknown job')} — ${escapeHtml(job.company || '')}</h3><p class="meta">${escapeHtml(job.country || '')} · <span class="status ${application.status}">${application.status.replaceAll('_', ' ')}</span></p><a href="${escapeHtml(job.url || '#')}" target="_blank" rel="noreferrer">Open official listing ↗</a>${draft}</div><div class="queue-actions">${action}</div>`;
    const actionButton = $('[data-action]', row);
    if (actionButton) actionButton.onclick = async () => {
      const actionName = actionButton.dataset.action;
      if (actionName === 'draft') await request(`/api/applications/${application.id}/email-draft`, { method: 'POST' });
      else await request(`/api/applications/${application.id}/${actionName}`, { method: 'POST' });
      await load();
    };
    const copyButton = $('[data-copy]', row);
    if (copyButton) copyButton.onclick = async () => { await navigator.clipboard.writeText(`${application.emailDraft.subject}\n\n${application.emailDraft.body}`); copyButton.textContent = 'Copied'; };
    list.append(row);
  });
}
function renderProfile() {
  const profile = state.profile || {}; const form = $('#profile-form');
  ['fullName', 'email', 'github', 'linkedin', 'portfolio', 'cvSummary'].forEach(key => form.elements[key].value = profile[key] || '');
  form.elements.dailyApplicationLimit.value = state.settings?.dailyApplicationLimit || 5;
  if (profile.cvFileName) $('#cv-status').textContent = `${profile.cvFileName} loaded.`;
}
function render() { renderJobs(); renderQueue(); renderProfile(); }
async function load() { state = await request('/api/state'); render(); }

document.querySelectorAll('nav button').forEach(button => button.onclick = () => switchTab(button.dataset.tab));
$('#job-search').oninput = () => { visibleCount = 40; renderJobs(); };
$('#source-filter').onchange = () => { visibleCount = 40; renderJobs(); };
$('#load-more').onclick = () => { visibleCount += 40; renderJobs(); };
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
    if (!response.ok) throw new Error(data.error); status.textContent = `${data.fileName} uploaded.`; await load();
  } catch (error) { status.textContent = error.message; }
};
$('#profile-form').onsubmit = async event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  const dailyApplicationLimit = Number(data.dailyApplicationLimit); delete data.dailyApplicationLimit; delete data.cv;
  await request('/api/profile', { method: 'PUT', body: JSON.stringify(data) });
  await request('/api/settings', { method: 'PUT', body: JSON.stringify({ dailyApplicationLimit }) });
  $('#profile-status').textContent = 'Saved.'; await load();
};
load().catch(error => alert(error.message));
