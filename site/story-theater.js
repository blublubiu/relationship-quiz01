import { storyFrames } from './story-logic.js';
import { artMarkup } from './quiz-art.js';

export function createStoryTheater(report) {
  const root = document.createElement('section'); root.className = 'story-feature'; root.setAttribute('aria-label', '关系故事放映室');
  root.innerHTML = `<div class="story-feature-heading"><span class="story-eyebrow">A LOVE STORY, FOR YOU</span><h2>如果这种相处，走进一则故事</h2><p class="story-match"></p></div><div class="story-clue hidden"><small>从你的这个选择，先读起</small><p></p></div><div class="story-tabs" role="group" aria-label="选择要阅读的故事"></div><div class="cinema-screen"><div class="cinema-art" aria-hidden="true"></div><div class="screen-top"><span>关系故事放映室</span><span class="screen-index"></span></div><div class="cinema-content"><div class="screen-couple"></div><span class="frame-label"></span><p class="frame-text" aria-live="polite"></p></div><div class="screen-bottom"><div class="screen-progress" aria-hidden="true"><i></i></div><div class="cinema-controls"><button class="frame-prev" type="button" aria-label="上一幕">←</button><button class="film-play" type="button">播放故事 ▷</button><button class="frame-next" type="button" aria-label="下一幕">→</button></div><p class="screen-hint">点击播放，文字会逐幕浮现；也可以用左右箭头慢慢读。</p></div></div><div class="story-source"></div><details class="story-transcript"><summary>展开原文 · 静静读完</summary><div class="transcript-source"></div><h3 class="transcript-situation"></h3><p class="transcript-body"></p><p class="transcript-moment"></p></details><p class="story-note"></p>`;
  const $ = selector => root.querySelector(selector);
  $('.story-match').textContent = report.storyMatch;
  $('.cinema-art').innerHTML = artMarkup(report.result.id);
  $('.story-note').textContent = report.storyNote;
  if (report.storyClue) { $('.story-clue').classList.remove('hidden'); $('.story-clue p').textContent = `在“${report.storyClue.scene}”里，你选了：“${report.storyClue.choice}”`; }
  let selected = 0, index = 0, frames = [], playing = false, elapsed = 0, startedAt = 0, frameAnimation = null, transition = null, destroyed = false;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const duration = () => Math.max(7000, Math.min(21000, frames[index].text.length * 145 + 2400));
  const buttons = report.stories.map((story, i) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'story-tab';
    const number = document.createElement('span'); number.className = 'story-tab-number'; number.textContent = String(i + 1).padStart(2, '0');
    const title = document.createElement('strong'); title.textContent = story.couple;
    button.append(number, title); button.setAttribute('aria-label', '阅读故事：' + story.couple);
    button.addEventListener('click', () => selectStory(i)); $('.story-tabs').append(button); return button;
  });
  function syncControls() {
    $('.frame-prev').disabled = index === 0; $('.frame-next').disabled = index === frames.length - 1;
    $('.screen-index').textContent = `${String(index + 1).padStart(2, '0')} / ${String(frames.length).padStart(2, '0')} 幕`;
    $('.film-play').textContent = playing ? '暂停放映 Ⅱ' : index === frames.length - 1 ? '从头放映 ↻' : elapsed ? '继续播放 ▷' : '播放故事 ▷';
    $('.film-play').setAttribute('aria-pressed', String(playing));
    $('.frame-text').setAttribute('aria-live', playing ? 'off' : 'polite');
  }
  function updateProgress(fraction = elapsed / duration()) { $('.screen-progress i').style.transform = `scaleX(${Math.min(1, fraction)})`; }
  function pause() {
    if (playing) elapsed = Math.min(duration(), elapsed + performance.now() - startedAt);
    playing = false; cancelAnimationFrame(frameAnimation); frameAnimation = null; syncControls(); updateProgress();
  }
  function tick(now) {
    if (!playing || destroyed) return;
    const spent = elapsed + now - startedAt; updateProgress(spent / duration());
    if (spent >= duration()) {
      elapsed = 0;
      if (index < frames.length - 1) showFrame(index + 1, true);
      else { playing = false; syncControls(); updateProgress(1); }
      return;
    }
    frameAnimation = requestAnimationFrame(tick);
  }
  function startClock() { startedAt = performance.now(); frameAnimation = requestAnimationFrame(tick); }
  function showFrame(nextIndex, automatic = false) {
    cancelAnimationFrame(frameAnimation); clearTimeout(transition);
    if (!automatic) playing = false;
    index = nextIndex; elapsed = 0;
    const text = $('.frame-text');
    const paint = () => {
      if (destroyed) return;
      text.textContent = frames[index].text; text.dataset.kind = frames[index].kind;
      $('.frame-label').textContent = frames[index].label; text.classList.remove('is-leaving'); text.classList.add('is-arriving');
      syncControls(); updateProgress(0);
      if (playing) startClock();
    };
    text.classList.remove('is-arriving');
    if (automatic && !reduceMotion?.matches) { text.classList.add('is-leaving'); transition = setTimeout(paint, 420); }
    else paint();
  }
  function selectStory(next) {
    pause(); selected = next; const story = report.stories[selected]; frames = storyFrames(story);
    buttons.forEach((button, i) => { button.classList.toggle('selected', i === selected); button.setAttribute('aria-pressed', String(i === selected)); });
    $('.screen-couple').textContent = story.couple; $('.story-source').textContent = story.source;
    $('.transcript-source').textContent = story.source; $('.transcript-situation').textContent = story.situation;
    $('.transcript-body').textContent = story.body; $('.transcript-moment').textContent = story.moment;
    showFrame(0);
  }
  $('.film-play').addEventListener('click', () => {
    if (playing) { pause(); return; }
    if (index === frames.length - 1) showFrame(0);
    playing = true; syncControls(); startClock();
  });
  $('.frame-prev').addEventListener('click', () => { if (index > 0) showFrame(index - 1); });
  $('.frame-next').addEventListener('click', () => { if (index < frames.length - 1) showFrame(index + 1); });
  $('.story-transcript').addEventListener('toggle', () => { if ($('.story-transcript').open) pause(); });
  const onVisibility = () => { if (document.hidden) pause(); }; document.addEventListener('visibilitychange', onVisibility);
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => { if (!entries[0].isIntersecting && playing) pause(); }, { threshold: .05 }) : null;
  // Frames must exist before syncing the initial controls.
  frames = storyFrames(report.stories[0]); selectStory(0); observer?.observe($('.cinema-screen'));
  return { element: root, pause, destroy() { destroyed = true; playing = false; cancelAnimationFrame(frameAnimation); clearTimeout(transition); observer?.disconnect(); document.removeEventListener('visibilitychange', onVisibility); } };
}
