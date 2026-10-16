import test from 'node:test';
import assert from 'node:assert/strict';
import { getPartnerContent } from '../supabase/functions/quiz-api/partner-content.ts';
import { buildReport } from '../site/quiz-engine.js';
import { storyFrames, splitVerbatim, selectStories, rawStoryText } from '../site/story-logic.js';

const content = getPartnerContent(), all = Object.values(content.stories).flat();

test('all eighteen original selections belong to the intended six collections', () => {
  assert.equal(all.length, 18); assert.equal(new Set(all.map(story => story.id)).size, 18);
  for (const result of content.results) {
    assert.equal(content.stories[result.id].length, 3);
    for (const story of content.stories[result.id]) {
      assert.ok(story.source.startsWith('📖 ')); assert.ok(story.situation.startsWith('当你'));
      assert.ok(story.moment.startsWith('💡 降维打击的瞬间： '));
      assert.ok(story.body.length > 50);
    }
  }
  assert.ok(content.stories.R5[1].moment.includes('耐心裡'));
  assert.ok(content.stories.R3[2].source.includes('郗璿'));
});

test('every cinematic frame preserves source punctuation and full original text', () => {
  for (const story of all) {
    const frames = storyFrames(story);
    assert.equal(frames.filter(f => f.kind === 'situation').map(f => f.text).join(''), story.situation);
    assert.equal(frames.filter(f => f.kind === 'body').map(f => f.text).join(''), story.body);
    assert.equal(frames.filter(f => f.kind === 'moment').map(f => f.text).join(''), story.moment);
    assert.equal(rawStoryText(story), [story.source, story.situation, story.body, story.moment].join('\n'));
  }
  const quoted = '他说：“这是完整的一句话。”——仍然保留引号。';
  const chunks = splitVerbatim(quoted, 4); assert.equal(chunks.join(''), quoted);
  assert.ok(!chunks.some(chunk => chunk.startsWith('”')));
});

test('a concrete selected answer can change the recommended story within the same result', () => {
  const one = selectStories(content.stories.R5, [{ optionId: 'q6a', scene: '发生指责', choice: '先激动起来' }]);
  const two = selectStories(content.stories.R5, [{ optionId: 'q6b', scene: '发生指责', choice: '先暂停整理' }]);
  assert.equal(one.stories[0].id, 'R5-1'); assert.equal(two.stories[0].id, 'R5-2');
  assert.equal(one.storyClue.choice, '先激动起来');
  const noClue = selectStories(content.stories.R3, [{ scene: '未知', choice: '未知' }]);
  assert.equal(noClue.storyClue, null);
  assert.notEqual(noClue.stories[0].id, 'R3-2');
});

test('story selections never change the companion result or reinterpret an unrelated choice', () => {
  const answers = Object.fromEntries('a a c a a a a a a a a d'.split(' ').map((letter, i) => ['q' + (i + 1), 'q' + (i + 1) + letter]));
  const withStories = buildReport(content, answers, 'fixed');
  const noStories = buildReport({ ...content, stories: {} }, answers, 'fixed');
  assert.deepEqual(withStories.result, noStories.result); assert.deepEqual(withStories.evidence, noStories.evidence);
  assert.equal(withStories.stories.length, 3); assert.ok(withStories.storyClue);
  assert.equal(noStories.stories.length, 0);
});
