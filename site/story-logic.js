// Chunk only at existing punctuation; joining chunks must reproduce the source.
export function splitVerbatim(text, preferredLength = 52) {
  const pieces = []; let current = '';
  const characters = [...String(text)];
  for (let i = 0; i < characters.length; i++) {
    current += characters[i];
    if (current.length >= preferredLength && /[。！？；]/u.test(characters[i])) {
      while (i + 1 < characters.length && /[”’」』）]/u.test(characters[i + 1])) current += characters[++i];
      pieces.push(current); current = '';
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

export function storyFrames(story) {
  return [
    { kind: 'situation', label: '开场 · 如果你也有过这样的时刻', text: story.situation },
    ...splitVerbatim(story.body).map(text => ({ kind: 'body', label: '故事 · 把相处放进一个画面', text })),
    ...splitVerbatim(story.moment, 62).map(text => ({ kind: 'moment', label: '回响 · 选编原文', text })),
  ];
}

export function selectStories(stories = [], choices = []) {
  const ranked = stories.map((story, index) => {
    const clues = choices.filter(choice => choice.optionId && (story.signals?.[choice.optionId] || 0) > 0);
    return { story, index, clues, score: clues.reduce((sum, choice) => sum + story.signals[choice.optionId], 0) };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const lead = ranked[0];
  return {
    stories: ranked.map(item => item.story),
    storyClue: lead?.clues.length ? { scene: lead.clues[0].scene, choice: lead.clues[0].choice } : null,
    storyMatch: lead?.clues.length ? '从你选过的相处片段出发，先读这则故事，再看看另两种关系视角。' : '三则故事提供不同的相处视角。可以从最想读的一则开始，故事标题不代表你一定有过相同经历。',
  };
}

export function rawStoryText(story) {
  return [story.source, story.situation, story.body, story.moment].join('\n');
}
