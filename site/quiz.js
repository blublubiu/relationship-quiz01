import { CONTENT_VERSION, buildReport, shuffledOptions, validateContent } from './quiz-engine.js';
import { artMarkup } from './quiz-art.js';
import { createReportImage, createShareImage } from './quiz-export.js';
import { createStoryTheater } from './story-theater.js';
import { selectStories } from './story-logic.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SESSION_KEY = 'partner-quiz-active-v2', REPORT_KEY = 'partner-quiz-last-report-v2';
const config = window.RELATIONSHIP_QUIZ_CONFIG || {};
const localPreview = Boolean(config.localPreview && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname));
let session = null, report = null, advanceTimer = null, activeModal = null, returnFocus = null, exporting = false, imageFile = null, lastReviewIndex = -1;
let storyTheater = null;

function readStorage(storage, key) { try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; } }
function saveStorage(storage, key, value) { try { storage.setItem(key, JSON.stringify(value)); } catch { /* Export remains available if storage is disabled. */ } }
function getLastReport() { try { const r = readStorage(localStorage, REPORT_KEY); return r?.version === CONTENT_VERSION && r?.result?.name && Array.isArray(r.evidence) ? r : null; } catch { return null; } }
function persist() { try { if (session) saveStorage(sessionStorage, SESSION_KEY, session); } catch { /* Browsing still works with storage disabled. */ } }
function showView(id) {
  clearTimeout(advanceTimer);
  if (id !== 'result') storyTheater?.pause();
  for (const view of ['gate', 'quiz', 'result']) $('#' + view).classList.toggle('hidden', view !== id);
  window.scrollTo({ top: 0, behavior: 'auto' });
}
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 2600); }

async function apiRequest(path, payload, signal) {
  if (!localPreview && (!config.supabaseUrl || !config.publishableKey)) throw new Error('测试服务尚未配置，请联系店铺客服。');
  const url = localPreview ? '/api/' + path : config.supabaseUrl.replace(/\/$/, '') + '/functions/v1/quiz-api/api/' + path;
  const headers = { 'Content-Type': 'application/json' };
  if (!localPreview) headers.apikey = config.publishableKey;
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '暂时无法开始测试，请稍后再试。');
  return data;
}
async function startRequest(code, signal) {
  const data = await apiRequest('start', { code, content_version: CONTENT_VERSION }, signal);
  validateContent(data.content); return data;
}

$('#gateForm').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('#begin').disabled) return;
  const code = $('#password').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 12) { $('#gateError').textContent = '请输入购买后收到的 12 位密码，字母和数字均可，横线可省略。'; return; }
  const button = $('#begin'), controller = new AbortController();
  button.disabled = true; button.textContent = '正在验证并加载…'; $('#gateError').textContent = '连接成功后，12 题和完整报告将一次加载。';
  const slow = setTimeout(() => { $('#gateError').textContent = '连接稍慢，请先保持本页打开，避免重复点击。'; }, 5000);
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const data = await startRequest(code, controller.signal);
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    session = { version: CONTENT_VERSION, content: data.content, answers: {}, index: 0, presentation: shuffledOptions(data.content.questions, random), remaining: data.remaining, completed: false, createdAt: new Date().toISOString() };
    report = null; persist(); renderQuestion(); showView('quiz'); $('#password').value = '';
  } catch (error) {
    $('#gateError').textContent = error.name === 'AbortError' || error instanceof TypeError ? '连接暂时中断，请稍后再试。如可用次数出现变化，请联系客服核对。' : error.message;
  } finally { clearTimeout(slow); clearTimeout(timeout); button.disabled = false; button.innerHTML = '验证密码，开始测试 <span aria-hidden="true">↗</span>'; }
});
window.quizEntryReady = true;

function renderQuestion() {
  const q = session.content.questions[session.index], group = session.content.groups.find(g => g.id === q.group);
  $('#groupName').textContent = group.name; $('#groupCaption').textContent = group.caption;
  $('#questionCount').textContent = `${String(session.index + 1).padStart(2, '0')} / 12`;
  $('#question').textContent = q.prompt;
  $('#progressFill').style.width = ((session.index + 1) / 12 * 100) + '%';
  $('.progress-track').setAttribute('aria-valuenow', String(session.index + 1));
  const container = $('#answers'); container.replaceChildren();
  session.presentation[q.id].forEach((id, position) => {
    const option = q.options.find(o => o.id === id), button = document.createElement('button');
    button.type = 'button'; button.className = 'answer' + (session.answers[q.id] === id ? ' selected' : '');
    button.setAttribute('aria-pressed', String(session.answers[q.id] === id)); button.dataset.option = id;
    const letter = document.createElement('span'); letter.className = 'answer-letter'; letter.textContent = 'ABCD'[position]; letter.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'); text.textContent = option.text; button.append(letter, text);
    button.addEventListener('click', () => chooseOption(id)); container.append(button);
  });
  $('#prev').disabled = session.index === 0; $('#next').disabled = !session.answers[q.id];
  $('#next').textContent = session.index === 11 ? '查看我的报告 →' : '下一题 →';
  persist();
}

function chooseOption(id) {
  clearTimeout(advanceTimer);
  const q = session.content.questions[session.index];
  session.answers[q.id] = id; persist();
  for (const button of $('#answers').children) { const selected = button.dataset.option === id; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); }
  $('#next').disabled = false;
  const chosenIndex = session.index;
  advanceTimer = setTimeout(() => { if (session.index === chosenIndex && !$('#quiz').classList.contains('hidden')) nextQuestion(); }, 340);
}

function nextQuestion() {
  clearTimeout(advanceTimer);
  if (!session.answers[session.content.questions[session.index].id]) return;
  if (session.index < 11) { session.index++; renderQuestion(); $('#question').focus({ preventScroll: true }); }
  else {
    try {
      report = buildReport(session.content, session.answers); session.completed = true; persist();
      try { saveStorage(localStorage, REPORT_KEY, report); } catch { /* Export remains available. */ }
      renderReport(report); showView('result');
    } catch (error) { toast(error.message); }
  }
}
$('#prev').addEventListener('click', () => { clearTimeout(advanceTimer); if (session.index > 0) { session.index--; renderQuestion(); } });
$('#next').addEventListener('click', nextQuestion);

function safeLink(url) { try { const parsed = new URL(url); return parsed.protocol === 'https:' ? esc(parsed.href) : '#'; } catch { return '#'; } }
function renderReport(value) {
  storyTheater?.destroy(); storyTheater = null;
  report = value; const r = report.result;
  $('#resultBody').innerHTML = `
    <article class="report-module report-hero">
      <div class="module-kicker">01 / 更值得了解的伴侣画像</div>
      <p class="result-label">与你这次相处需要更贴近的，是</p>
      <h1 class="result-name">${esc(r.name)}</h1>
      <div class="report-art" aria-hidden="true">${artMarkup(r.id)}</div>
      <blockquote class="result-quote">${esc(r.quote)}</blockquote>
      <div class="result-keywords">${r.keywords.map(k => `<span>${esc(k)}</span>`).join('')}</div>
      <p class="result-intro">${esc(r.intro)}</p>
    </article>
    <article class="report-module">
      <div class="module-kicker">02 / 从你的选择出发</div><h2 class="module-heading">你真正想被怎样对待？</h2>
      <p>${esc(r.explanation)}</p>
      <div class="evidence-list">${report.evidence.map((e, i) => `<article class="evidence-card"><div class="evidence-top"><span>${esc(e.group)}</span><span>线索 ${String(i + 1).padStart(2, '0')}</span></div><h3>${esc(e.scene)}</h3><blockquote>${esc(e.choice)}</blockquote><p>${esc(e.reading)}</p></article>`).join('')}</div>
      ${report.nuance ? `<aside class="nuance"><strong>还有一处选择，值得一起看</strong><p>在“${esc(report.nuance.scene)}”里，你选了：${esc(report.nuance.choice)}</p><p>${esc(report.nuance.text)}</p></aside>` : ''}
      ${report.groundedNote ? `<p>${esc(report.groundedNote)}</p>` : ''}<p class="match-note">${esc(report.matchNote)}</p>
    </article>
    <article class="report-module"><div class="module-kicker">03 / 避坑指南</div><h2 class="module-heading">这类相处，值得谨慎</h2><p>看是否反复发生，也看提出之后有没有实际调整。</p><div class="risk-grid">${r.risks.map(item => `<div class="risk-card"><span class="risk-icon" aria-hidden="true">↘</span><h3>${esc(item.title)}</h3><p>${esc(item.scene)}</p><p class="consequence">${esc(item.consequence)}</p></div>`).join('')}</div></article>
    <article class="report-module"><div class="module-kicker">04 / 把适配落到行动</div><h2 class="module-heading">这样的 ta，会怎样与你相处？</h2><div class="help-grid">${r.help.map((item, i) => `<div class="help-item"><span class="help-number">${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></div></div>`).join('')}</div></article>
    <div id="storyMount"></div><article class="report-module"><div class="module-kicker">06 / 沟通与相处指南</div><h2 class="module-heading">下一次，可以这样开口</h2><div class="practice-grid"><div class="practice"><strong>少做一点</strong><p>${esc(r.dont)}</p></div><div class="practice positive"><strong>试着改成</strong><p>${esc(r.do)}</p></div></div><div class="script-box"><small>把需要说具体 · 这句话可以直接带走</small><blockquote>${esc(r.script)}</blockquote><button id="copyScript" class="copy-script" type="button">复制这句话</button></div><p class="principle">记住：${esc(r.principle)}</p></article>
    <article class="report-module kit"><div class="module-kicker">07 / 你的专属清醒锦囊</div><h2 class="module-heading">未来一周，把观察变成选择</h2><ul class="action-list">${r.action.map(item => `<li><span class="action-check" aria-hidden="true"></span><span>${esc(item)}</span></li>`).join('')}</ul>
      <details class="report-method"><summary>这份结果怎样形成 · 查看本次 12 项选择</summary><p>${esc(report.methodNote)}</p><p>本测试用自定义权重交叉比较相处反应与需要，优先引用不同情境中的实际选项；接近的结果会明确提示。支持偏好与假设题不用于单独判定行为模式。题库未进行心理量表信效度验证，不输出诊断或“契合率”。</p><p>以下研究仅用于理解关系回应与依恋研究背景，并非本测试准确性的背书。</p><ul>${report.references.map(ref => `<li><a href="${safeLink(ref.url)}" target="_blank" rel="noopener noreferrer">${esc(ref.title)}</a>：${esc(ref.note)}</li>`).join('')}</ul><div class="all-choices">${report.choices.map((item, i) => `<p><b>${i + 1}. ${esc(item.scene)}</b><br>${esc(item.choice)}</p>`).join('')}</div></details>
    </article>`;
  $('#copyScript').addEventListener('click', () => copyText(r.script, '这句话已复制'));
  if (report.stories?.length === 3) {
    storyTheater = createStoryTheater(report); $('#storyMount').append(storyTheater.element);
  } else {
    $('#storyMount').innerHTML = '<section class="story-upgrade"><span class="story-eyebrow">THE STORY CONTINUES</span><h2>给这份报告，补上三则故事</h2><p>这是你在更新前保存的结果。输入原密码即可补充故事，不扣测试次数；原来的分析会继续保留。</p><form id="storyUpgradeForm"><input id="storyUpgradeCode" type="text" aria-label="用于补充故事的原测试密码" placeholder="输入原测试密码" autocomplete="off" autocapitalize="characters" maxlength="40" required><button class="btn secondary" type="submit">补充故事 · 不扣次</button></form><div id="storyUpgradeStatus" role="status"></div></section>';
    $('#storyUpgradeForm').addEventListener('submit', async event => {
      event.preventDefault();
      const code = $('#storyUpgradeCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 12) { $('#storyUpgradeStatus').textContent = '请输入原来的 12 位测试密码。'; return; }
      const button = $('#storyUpgradeForm button'), status = $('#storyUpgradeStatus'), controller = new AbortController();
      button.disabled = true; status.textContent = '正在补充故事，不会扣除次数…';
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const data = await apiRequest('stories', { code, result_id: report.result.id }, controller.signal);
        if (data.stories?.length !== 3) throw new Error('故事内容暂未就绪，请稍后再试。');
        const choices = report.choices.map(choice => ({ ...choice, optionId: choice.optionId || data.optionLookup?.[choice.choice] }));
        const updated = { ...report, choices, ...selectStories(data.stories, choices), storyEdition: data.storyEdition, storyNote: data.storyNote };
        try { saveStorage(localStorage, REPORT_KEY, updated); } catch { /* current result still updates */ }
        if (session?.content) { session.content.stories = { ...session.content.stories, [report.result.id]: data.stories }; session.content.storyEdition = data.storyEdition; session.content.storyNote = data.storyNote; persist(); }
        renderReport(updated); toast('三则故事已补充，没有扣除测试次数');
      } catch (error) { status.textContent = error.name === 'AbortError' || error instanceof TypeError ? '连接暂时中断，请稍后重试。本次不扣次。' : error.message; }
      finally { clearTimeout(timeout); button.disabled = false; }
    });
  }
}

$('#restart').addEventListener('click', () => {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* no storage */ }
  session = null; $('#gateError').textContent = '开始新一轮会使用 1 次机会；查看已保存的结果不会扣次。';
  $('#lastResult').classList.toggle('hidden', !getLastReport()); showView('gate'); $('#password').focus();
});
$('#lastResult').addEventListener('click', () => { const saved = getLastReport(); if (saved) { renderReport(saved); showView('result'); } });

async function copyText(text, success) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else throw new Error('fallback');
    toast(success);
  } catch {
    const field = document.createElement('textarea'); field.value = text; field.style.cssText = 'position:fixed;left:0;top:0;opacity:.01'; document.body.append(field); field.select(); field.setSelectionRange(0, field.value.length);
    const copied = document.execCommand('copy'); field.remove(); toast(copied ? success : '请长按文字手动复制');
  }
}

function openModal(id) { storyTheater?.pause(); returnFocus = document.activeElement; activeModal = id; $('#' + id).classList.remove('hidden'); document.body.classList.add('modal-open'); $('#' + id + ' button')?.focus(); }
function closeModal() { if (!activeModal) return; $('#' + activeModal).classList.add('hidden'); activeModal = null; document.body.classList.remove('modal-open'); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); }
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('[data-close]')) closeModal();
  else if (event.target === $('#reviewModal') || event.target === $('#imageModal')) closeModal();
});
document.addEventListener('keydown', event => {
  if (activeModal) {
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
    if (event.key === 'Tab') {
      const focusable = [...$('#' + activeModal).querySelectorAll('button:not(:disabled),a[href],input,textarea,[tabindex="0"]')];
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
    }
    return;
  }
  if (!session || $('#quiz').classList.contains('hidden') || ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
  if (['1', '2', '3', '4'].includes(event.key)) { event.preventDefault(); $('#answers').children[Number(event.key) - 1]?.click(); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); $('#prev').click(); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); $('#next').click(); }
});

const fallbackReviews = ['题目都是生活里会遇到的场景，做起来挺顺的。', '挺有意思的，给了我一个重新看相处方式的角度。', '喜欢后面那些具体的沟通建议，准备留着慢慢看。', '比只给一个标签更有内容，还能保存报告。'];
function nextReview() {
  const values = session?.content?.reviewSamples; const samples = Array.isArray(values) && values.length ? values : fallbackReviews;
  let index = Math.floor(Math.random() * samples.length); if (samples.length > 1 && index === lastReviewIndex) index = (index + 1) % samples.length;
  lastReviewIndex = index; $('#reviewSample').textContent = String(samples[index]);
}
$('#reviewGift').addEventListener('click', () => { nextReview(); openModal('reviewModal'); });
$('#newReview').addEventListener('click', nextReview);
$('#copyReview').addEventListener('click', () => copyText($('#reviewSample').textContent, '这条参考已复制，请按真实体验使用'));

async function exportReport(kind) {
  if (!report || exporting) return;
  exporting = true; const button = $(kind === 'share' ? '#share' : '#saveResult'), original = button.textContent;
  button.disabled = true; button.textContent = '正在生成图片…';
  try {
    imageFile = await (kind === 'share' ? createShareImage(report) : createReportImage(report));
    $('#exportImage').src = imageFile.dataUrl; $('#exportImage').alt = kind === 'share' ? report.result.name + ' · 分享卡' : report.result.name + ' · 完整关系观察报告';
    $('#imageTitle').textContent = kind === 'share' ? '分享卡 · 长按图片保存' : '完整结果长图 · 长按图片保存';
    $('#imageModal .image-scroll').scrollTop = 0; openModal('imageModal');
  } catch (error) { toast(error.message || '生成图片失败，请再试一次。'); }
  finally { exporting = false; button.disabled = false; button.textContent = original; }
}
$('#share').addEventListener('click', () => exportReport('share'));
$('#saveResult').addEventListener('click', () => exportReport('full'));
$('#downloadImage').addEventListener('click', () => {
  if (!imageFile) return;
  const bytes = Uint8Array.from(atob(imageFile.dataUrl.split(',')[1]), character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: imageFile.type }));
  const link = document.createElement('a'); link.href = url; link.download = imageFile.fileName;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
});

$('#gateArt').innerHTML = artMarkup('R1');
$('#lastResult').classList.toggle('hidden', !getLastReport());
if (localPreview) { $('#previewNotice').classList.remove('hidden'); $('#previewNotice').textContent = '本机验收预览 · 密码：' + (config.previewCode || '由本地预览服务提供') + ' · 不连接正式密码数据库'; }
try {
  const saved = readStorage(sessionStorage, SESSION_KEY);
  if (saved?.version === CONTENT_VERSION) {
    validateContent(saved.content);
    if (!Number.isInteger(saved.index) || saved.index < 0 || saved.index > 11 || !saved.answers || !saved.presentation) throw new Error('invalid local progress');
    session = saved;
    if (session.completed) { renderReport(buildReport(session.content, session.answers)); showView('result'); }
    else { showView('quiz'); renderQuestion(); }
  }
} catch { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ } session = null; }
