const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const STORE_FILE = path.join(ROOT, 'data', 'store.json');
const CV_DIR = path.join(ROOT, 'data', 'cv');
const BROWSER_PROFILE = path.join(ROOT, '.browser-profile');
const REPORT_DIR = path.join(ROOT, 'data', 'autofill-reports');
const BLOCKED_DOMAINS = ['flexjobs.com', 'virtualvocations.com'];

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function normalized(value = '') {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function isBlocked(url) {
  const host = new URL(url).hostname.toLowerCase();
  return BLOCKED_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

function loadInput() {
  const store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  const applicationId = argument('--application');
  const directUrl = argument('--url');
  let items = [];
  if (applicationId) {
    const application = store.applications.find(item => item.id === applicationId);
    const job = application && store.jobs.find(item => item.id === application.jobId);
    if (!application || !job) throw new Error('Application queue item was not found.');
    items = [{ application, job }];
  } else if (directUrl) {
    items = [{ application: null, job: { id: 'direct', title: 'Direct application', company: '', url: directUrl } }];
  } else {
    items = store.applications
      .filter(item => ['approved', 'ready_for_review'].includes(item.status))
      .map(application => ({ application, job: store.jobs.find(item => item.id === application.jobId) }))
      .filter(item => item.job);
    if (!process.argv.includes('--queue')) items = items.slice(0, 1);
    if (!items.length) throw new Error('No pending application exists. Add a job to the review queue first.');
  }
  const cvFiles = fs.readdirSync(CV_DIR)
    .filter(name => name.toLowerCase().endsWith('.pdf'))
    .map(name => ({ name, path: path.join(CV_DIR, name), modified: fs.statSync(path.join(CV_DIR, name)).mtimeMs }))
    .sort((a, b) => b.modified - a.modified);
  if (!cvFiles.length) throw new Error('No saved PDF CV was found. Upload it in the Profile tab first.');
  return { store, items, cvPath: cvFiles[0].path };
}

async function fieldText(locator) {
  return normalized(await locator.evaluate(element => {
    const labels = element.labels ? [...element.labels].map(label => label.innerText).join(' ') : '';
    return `${labels} ${element.getAttribute('aria-label') || ''} ${element.getAttribute('placeholder') || ''} ${element.getAttribute('name') || ''} ${element.id || ''}`;
  }));
}

function answerFor(text, profile) {
  const names = (profile.fullName || '').trim().split(/\s+/);
  const rules = [
    [/\bfirst.?name\b|given.?name/, names[0] || ''],
    [/\blast.?name\b|surname|family.?name/, names.slice(1).join(' ')],
    [/\bfull.?name\b|candidate.?name|applicant.?name|^name$/, profile.fullName],
    [/\be-?mail\b/, profile.email],
    [/\bphone\b|mobile|telephone/, profile.phone],
    [/linkedin/, profile.linkedin],
    [/github/, profile.github],
    [/portfolio|personal website|website url/, profile.portfolio],
    [/current location|your location|city.*country|address/, profile.currentLocation],
    [/notice period|available to start|start date/, profile.noticePeriod],
    [/salary|compensation|pay expectation|desired pay/, profile.salaryExpectation],
    [/work authorization|work eligibility/, profile.workAuthorization]
  ];
  return rules.find(([pattern, value]) => value && pattern.test(text))?.[1] || '';
}

async function fillInputs(page, profile, cvPath, actions) {
  const inputs = page.locator('input:visible, textarea:visible');
  for (let index = 0; index < await inputs.count(); index += 1) {
    const input = inputs.nth(index);
    if (await input.isDisabled() || await input.isHidden()) continue;
    const type = normalized(await input.getAttribute('type') || 'text');
    if (['hidden', 'submit', 'button', 'reset', 'image', 'radio', 'checkbox'].includes(type)) continue;
    if (type === 'file') {
      const accept = normalized(await input.getAttribute('accept') || '');
      if (!accept || accept.includes('pdf') || accept.includes('document')) {
        await input.setInputFiles(cvPath);
        actions.push('Uploaded saved PDF CV');
      }
      continue;
    }
    if (await input.inputValue().catch(() => '')) continue;
    const text = await fieldText(input);
    const answer = answerFor(text, profile);
    if (!answer) continue;
    await input.fill(answer);
    actions.push(`Filled ${text.slice(0, 70)}`);
  }
}

async function fillCountrySelects(page, actions) {
  const selects = page.locator('select:visible');
  for (let index = 0; index < await selects.count(); index += 1) {
    const select = selects.nth(index);
    if (await select.isDisabled()) continue;
    const text = await fieldText(select);
    if (!/country|location/.test(text)) continue;
    const options = await select.locator('option').allTextContents();
    const pakistan = options.find(option => /\bpakistan\b/i.test(option));
    if (pakistan) {
      await select.selectOption({ label: pakistan.trim() });
      actions.push('Selected Pakistan');
    }
  }
}

async function acceptRequiredConsent(page, actions) {
  const checkboxes = page.locator('input[type="checkbox"]:visible');
  for (let index = 0; index < await checkboxes.count(); index += 1) {
    const checkbox = checkboxes.nth(index);
    if (await checkbox.isChecked() || !(await checkbox.getAttribute('required'))) continue;
    const text = await fieldText(checkbox);
    if (/privacy|terms|consent|acknowledge|certify|data processing/.test(text) && !/marketing|newsletter|promotion/.test(text)) {
      await checkbox.check();
      actions.push(`Accepted required consent: ${text.slice(0, 60)}`);
    }
  }
}

async function requiredUnknowns(page) {
  return page.locator('input:visible, textarea:visible, select:visible').evaluateAll(elements =>
    elements.filter(element => {
      if (!element.required || element.disabled) return false;
      if (element.type === 'file') return !element.files?.length;
      if (element.type === 'checkbox' || element.type === 'radio') {
        const group = element.name ? [...document.getElementsByName(element.name)] : [element];
        return !group.some(input => input.checked);
      }
      return !String(element.value || '').trim();
    }).map(element => {
      const labels = element.labels ? [...element.labels].map(label => label.innerText).join(' ') : '';
      return (labels || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.name || element.id || element.type).trim();
    }).filter(Boolean)
  );
}

async function openApplicationForm(page, originalUrl) {
  await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  if (await page.locator('form input:visible, form textarea:visible').first().isVisible().catch(() => false)) return page;
  const apply = page.getByRole('link', { name: /apply|application/i }).last()
    .or(page.getByRole('button', { name: /apply|application/i }).last());
  if (await apply.isVisible().catch(() => false)) {
    const popupPromise = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await apply.click();
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded');
      return popup;
    }
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }
  return page;
}

async function hasHumanVerification(page) {
  const frameChallenge = page.locator([
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="challenges.cloudflare.com"]',
    'iframe[title*="challenge" i]',
    'iframe[title*="captcha" i]'
  ].join(', '));
  if (await frameChallenge.count()) return true;
  return page.getByText(/verify you are human|checking your browser|security verification|complete the captcha/i)
    .first()
    .isVisible()
    .catch(() => false);
}

async function waitForHumanVerification(page, actions) {
  if (!(await hasHumanVerification(page))) return;
  actions.push('Paused for manual human verification');
  console.log(`\nHuman verification detected on ${page.url()}. Complete it in the open browser; autofill will resume automatically.`);
  await page.bringToFront();
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1500);
    if (!(await hasHumanVerification(page))) {
      actions.push('Human verification completed; autofill resumed');
      return;
    }
  }
  throw new Error('Human verification was not completed within 10 minutes.');
}

async function main() {
  const { store, items, cvPath } = loadInput();
  if (items.every(({ job }) => isBlocked(job.url))) {
    throw new Error('Automation is disabled for the selected site by its current terms. Use the manual shortcut.');
  }
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: false,
    viewport: null,
    args: ['--start-maximized']
  });
  const initialPage = context.pages()[0] || await context.newPage();
  const reports = [];
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  for (let index = 0; index < items.length; index += 1) {
    const { application, job } = items[index];
    let page = index === 0 ? initialPage : await context.newPage();
    const actions = [];
    try {
      if (isBlocked(job.url)) throw new Error('Automation is disabled for this site by its current terms.');
      page = await openApplicationForm(page, job.url);
      if (isBlocked(page.url())) throw new Error('The application redirected to a site where automation is disabled.');
      await waitForHumanVerification(page, actions);
      await fillInputs(page, store.profile || {}, cvPath, actions);
      await fillCountrySelects(page, actions);
      await acceptRequiredConsent(page, actions);
      const unknownRequired = await requiredUnknowns(page);
      const report = {
        applicationId: application?.id || null,
        job: `${job.title || ''} — ${job.company || ''}`.trim(),
        pageUrl: page.url(),
        filledAt: new Date().toISOString(),
        actions,
        unknownRequired,
        readyForReview: unknownRequired.length === 0
      };
      reports.push(report);
      fs.writeFileSync(path.join(REPORT_DIR, `${application?.id || Date.now()}.json`), JSON.stringify(report, null, 2));
    } catch (error) {
      reports.push({
        applicationId: application?.id || null,
        job: `${job.title || ''} — ${job.company || ''}`.trim(),
        pageUrl: page.url(),
        filledAt: new Date().toISOString(),
        actions,
        unknownRequired: [],
        readyForReview: false,
        error: error.message
      });
    }
  }
  console.log(JSON.stringify(reports, null, 2));
  console.log(`\n${reports.filter(report => report.readyForReview).length}/${reports.length} forms are fully filled; review the open browser tabs.`);
  await context.pages()[0]?.bringToFront();
  await new Promise(resolve => context.on('close', resolve));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { answerFor, isBlocked, fillInputs, fillCountrySelects, requiredUnknowns, hasHumanVerification };
