import test from 'node:test';
import assert from 'node:assert/strict';
import { getPartnerContent } from '../supabase/functions/quiz-api/partner-content.ts';
import { buildReport, shuffledOptions, validateContent } from '../site/quiz-engine.js';

const content = getPartnerContent();
const answersFor = letters => Object.fromEntries(letters.split(' ').map((letter, i) => [`q${i + 1}`, `q${i + 1}${letter}`]));
const fixtures = {
  R1: 'a a c a d d d a a a a a',
  R2: 'b d b b b b b b b b b b',
  R3: 'c a a c c c c c c b c c',
  R4: 'd b d d d d d d d c d c',
  R5: 'a a c a a a a a a a a d',
  R6: 'c c d b d d c d c d c a',
};

test('six distinct scene patterns recommend the intended partner behaviours', () => {
  for (const [expected, letters] of Object.entries(fixtures)) {
    const answers = answersFor(letters), report = buildReport(content, answers);
    assert.equal(report.result.id, expected, expected);
    assert.equal(report.evidence.length, 3);
    assert.equal(new Set(report.evidence.map(e => e.questionId)).size, 3);
    for (const evidence of report.evidence) {
      const selected = content.questions.find(q => q.id === evidence.questionId).options.find(o => o.id === answers[evidence.questionId]);
      assert.equal(evidence.choice, selected.text);
      assert.equal(evidence.reading, selected.reading);
    }
    assert.equal(report.result.help.length, 3);
    assert.equal(report.result.action.length, 3);
  }
});

test('option order has no influence on scoring or the selected evidence', () => {
  const shuffled = structuredClone(content);
  shuffled.questions.forEach(q => q.options.reverse());
  for (const letters of Object.values(fixtures)) assert.deepEqual(buildReport(content, answersFor(letters), 'fixed'), buildReport(shuffled, answersFor(letters), 'fixed'));
  const order = shuffledOptions(content.questions, 1234);
  assert.deepEqual(order, shuffledOptions(content.questions, 1234));
  assert.notDeepEqual(order, shuffledOptions(content.questions, 4312));
  for (const q of content.questions) assert.deepEqual([...order[q.id]].sort(), q.options.map(o => o.id).sort());
});

test('wanting comfort or fearing a conflict outcome alone does not trigger a conflict-repair profile', () => {
  const answers = answersFor(fixtures.R4); answers.q2 = 'q2a'; answers.q12 = 'q12d';
  assert.notEqual(buildReport(content, answers).result.id, 'R5');
  for (const id of ['q2', 'q10', 'q12']) for (const option of content.questions.find(q => q.id === id).options) assert.deepEqual(option.styles, {});
});

test('incomplete, forged and incompatible inputs fail rather than creating a report', () => {
  assert.throws(() => buildReport(content, {}));
  const forged = answersFor(fixtures.R1); forged.q1 = 'q2a';
  assert.throws(() => buildReport(content, forged));
  assert.throws(() => validateContent({ ...content, version: 'old' }));
});

test('mixed responses retain a concrete counterexample instead of hiding inconvenient choices', () => {
  const answers = answersFor(fixtures.R3); answers.q5 = 'q5d';
  const report = buildReport(content, answers);
  assert.equal(report.result.id, 'R3');
  assert.ok(report.nuance);
  assert.ok(content.questions.some(q => q.options.some(o => o.id === answers[q.id] && o.text === report.nuance.choice)));
});

test('diverse responses all produce finite, grounded, deterministic results', () => {
  let seed = 9900; const next = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed; };
  const seen = new Set();
  for (let i = 0; i < 1200; i++) {
    const answers = Object.fromEntries(content.questions.map(q => [q.id, q.options[(next() >>> 16) % 4].id]));
    const report = buildReport(content, answers, 'fixed'); seen.add(report.result.id);
    assert.ok(report.evidence.length >= 2);
    assert.equal(report.choices.length, 12);
    if (i < 20) assert.deepEqual(report, buildReport(content, answers, 'fixed'));
  }
  assert.equal(seen.size, 6);
});
