export function createStoryTheater(report) {
  const root = document.createElement('section'); root.className = 'story-feature'; root.setAttribute('aria-label', '关系故事选读');
  root.innerHTML = '<div class="story-feature-heading"><span class="story-eyebrow">STORIES OF LOVE</span><h2>在故事里，看见一种相处</h2><p class="story-match">三则故事，三个关系视角，慢慢读完。</p></div>';
  for (const [index, story] of report.stories.entries()) {
    const card = document.createElement('article'); card.className = 'reading-story';
    for (const [tag, cls, value] of [['span', 'reading-number', '故事 ' + String(index + 1).padStart(2, '0')], ['h3', 'reading-source', story.source], ['h4', 'reading-situation', story.situation], ['p', 'reading-body', story.body], ['p', 'reading-moment', story.moment]]) {
      const el = document.createElement(tag); el.className = cls; el.textContent = value; card.append(el);
    }
    root.append(card);
  }
  const note = document.createElement('p'); note.className = 'story-note'; note.textContent = report.storyNote || ''; root.append(note);
  return { element: root, pause() {}, destroy() {} };
}
