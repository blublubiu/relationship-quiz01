export const CONTENT_VERSION = 'partner-v2-20261016';

export function validateContent(content) {
  if (!content || content.version !== CONTENT_VERSION || content.questions?.length !== 12 || content.results?.length !== 6) throw new Error('网站正在更新，请稍后刷新，再开始测试。');
  const optionIds = new Set();
  for (const q of content.questions) {
    if (!q.id || !Array.isArray(q.options) || q.options.length !== 4) throw new Error('题目内容不完整，请联系客服。');
    for (const option of q.options) {
      if (!option.id || optionIds.has(option.id) || !option.text || !option.reading) throw new Error('题目内容不完整，请联系客服。');
      optionIds.add(option.id);
      for (const values of [option.styles, option.needs]) if (!values || Object.values(values).some(v => !Number.isFinite(v) || v < 0)) throw new Error('题目内容不完整，请联系客服。');
    }
  }
  return content;
}

export function shuffledOptions(questions, seed) {
  let state = seed >>> 0;
  const random = () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return Object.fromEntries(questions.map(q => {
    const ids = q.options.map(o => o.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return [q.id, ids];
  }));
}

export function buildReport(content, answers, now = new Date().toISOString()) {
  validateContent(content);
  const selected = content.questions.map(q => {
    const option = q.options.find(o => o.id === answers[q.id]);
    if (!option) throw new Error('还有题目未作答，请完成全部 12 题。');
    return { q, option };
  });
  const raw = { styles: {}, needs: {} }, maximum = { styles: {}, needs: {} };
  for (const { q, option } of selected) for (const kind of ['styles', 'needs']) {
    for (const [key, value] of Object.entries(option[kind])) raw[kind][key] = (raw[kind][key] || 0) + value;
    const keys = new Set(q.options.flatMap(o => Object.keys(o[kind])));
    for (const key of keys) maximum[kind][key] = (maximum[kind][key] || 0) + Math.max(...q.options.map(o => o[kind][key] || 0));
  }
  const fitFor = (weights, kind) => {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    return Object.entries(weights).reduce((sum, [key, weight]) => sum + weight * (raw[kind][key] || 0) / (maximum[kind][key] || 1), 0) / (total || 1);
  };
  const preferenceOnly = new Set(['q2', 'q10', 'q12']);
  const candidates = content.results.map(result => {
    const style = fitFor(result.fit.styles, 'styles'), need = fitFor(result.fit.needs, 'needs');
    const evidence = selected.map(({ q, option }) => ({ q, option, value: Object.entries(result.fit.needs).reduce((s, [key, w]) => s + (option.needs[key] || 0) * w, 0) + Object.entries(result.fit.styles).reduce((s, [key, w]) => s + (option.styles[key] || 0) * w * .6, 0) })).filter(e => e.value > 0);
    const repairContexts = selected.filter(({ q, option }) => !preferenceOnly.has(q.id) && (option.needs.repair || 0) >= 2).length;
    return { result, style, need, evidence, score: .42 * style + .58 * need, eligible: result.id !== 'R5' || repairContexts >= 2 };
  }).filter(c => c.eligible);
  candidates.sort((a, b) => b.score - a.score || b.need - a.need || a.result.id.localeCompare(b.result.id));
  let winner = candidates[0];
  const nearby = candidates.filter(c => winner.score - c.score < .035);
  if (nearby.length > 1) winner = [...nearby].sort((a, b) => b.need - a.need || b.score - a.score || a.result.id.localeCompare(b.result.id))[0];
  // A concentrated conflict-repair pattern is more specific than general reassurance.
  // It must occur in at least three conflict situations AND the chosen regret,
  // so neither a single hypothetical answer nor wanting comfort can trigger it.
  const conflictRepairCount = selected.filter(({ q, option }) => q.group === 'conflict' && (option.needs.repair || 0) >= 2).length;
  const prioritizeRepair = conflictRepairCount >= 3 && answers.q12 === 'q12d';
  if (prioritizeRepair) winner = candidates.find(c => c.result.id === 'R5') || winner;
  const alternative = candidates.find(c => c.result.id !== winner.result.id);
  const evidence = [], used = new Set();
  const ordered = [...winner.evidence].sort((a, b) => b.value - a.value || Number(a.q.id.slice(1)) - Number(b.q.id.slice(1)));
  for (const group of content.groups) {
    const candidate = ordered.find(e => e.q.group === group.id);
    if (candidate) { evidence.push(candidate); used.add(candidate.q.id); }
  }
  for (const candidate of ordered) {
    if (evidence.length >= 3) break;
    if (!used.has(candidate.q.id)) { evidence.push(candidate); used.add(candidate.q.id); }
  }
  const directChoices = selected.filter(({ option }) => (option.styles.collaborate || 0) >= 2);
  const counter = selected.find(({ option }) => {
    const dominantStyle = Object.keys(winner.result.fit.styles)[0];
    return Object.entries(option.styles).some(([key, val]) => val >= 2 && key !== dominantStyle && (key === 'collaborate' || dominantStyle === 'collaborate'));
  });
  const close = !!alternative && Math.abs(winner.score - alternative.score) < .09;
  return {
    version: CONTENT_VERSION, createdAt: now, result: winner.result,
    evidence: evidence.map(({ q, option }) => ({ questionId: q.id, group: content.groups.find(g => g.id === q.group).name, scene: q.short, question: q.prompt, choice: option.text, reading: option.reading })),
    nuance: counter ? { scene: counter.q.short, choice: counter.option.text, text: counter.option.reading } : null,
    matchNote: prioritizeRepair ? '你的选择在多个冲突情境中都指向修复的需要，并在最后一题再次强调了这一点，因此本次优先呈现冲突修复方向。' : close ? `你的选择同时带有“${alternative.result.name}”的线索。这次优先呈现更突出的相处需要，可把两种方向都作为观察点。` : '这个推荐来自多道情境的交叉线索。它是下一步观察的方向，适配仍需要双方真实相处来确认。',
    secondaryName: close ? alternative.result.name : null,
    groundedNote: directChoices.length >= 3 ? '你在多个情境中选择了直接协商或有约定地暂停。报告会保留这部分能力；当前推荐不等于你没有边界或不会处理关系。' : '',
    choices: selected.map(({ q, option }) => ({ scene: q.short, choice: option.text })),
    references: content.references, methodNote: content.methodNote,
  };
}
