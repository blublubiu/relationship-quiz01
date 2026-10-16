import { artMarkup } from './quiz-art.js';

const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
const SERIF = 'Georgia,"Songti SC","STSong","SimSun",serif';

function rounded(ctx, x, y, w, h, radius, color) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.fillStyle = color; ctx.fill();
}
function linesFor(ctx, text, width) {
  const lines = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    let line = '';
    for (const character of paragraph) {
      if (line && ctx.measureText(line + character).width > width) { lines.push(line); line = character; }
      else line += character;
    }
    lines.push(line);
  }
  return lines;
}
function write(ctx, text, x, y, width, size, color, options = {}) {
  const { weight = 400, align = 'left', serif = false, leading = 1.7 } = options;
  ctx.font = `${weight} ${size}px ${serif ? SERIF : FONT}`;
  const lines = linesFor(ctx, text, width), lineHeight = Math.ceil(size * leading);
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}
async function loadArt(id) {
  const image = new Image();
  const promise = new Promise((resolve, reject) => { image.onload = () => resolve(image); image.onerror = () => reject(new Error('插画暂时未能生成，请重试。')); });
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(artMarkup(id));
  return promise;
}
function finishImage(canvas, type, fileName) {
  const dataUrl = canvas.toDataURL(type, .95);
  if (!dataUrl.startsWith('data:image/')) throw new Error('图片过长，请重试生成。');
  return { dataUrl, fileName, width: canvas.width, height: canvas.height, type };
}

export async function createShareImage(report) {
  const r = report.result, image = await loadArt(r.id), canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1350; const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法生成图片。');
  ctx.fillStyle = '#f6f0fb'; ctx.fillRect(0, 0, 1080, 1350);
  rounded(ctx, 43, 43, 994, 1264, 38, '#fffefd');
  write(ctx, '关 系 观 察 手 册  /  LOVE, IN REAL LIFE', 540, 113, 880, 22, '#ae9abe', { align: 'center' });
  write(ctx, '更值得了解的伴侣画像', 540, 194, 880, 25, '#a18ab5', { align: 'center' });
  write(ctx, r.name, 540, 250, 880, 61, '#74518f', { align: 'center', serif: true, weight: 500 });
  ctx.drawImage(image, 202, 337, 676, 394);
  let y = write(ctx, r.quote, 540, 768, 805, 39, '#7b638a', { align: 'center', serif: true, leading: 1.8 });
  y = Math.max(y + 66, 1003);
  write(ctx, '（' + r.profileLabel + '）', 540, y, 880, 23, '#ab94bc', { align: 'center' });
  rounded(ctx, 481, 1128, 118, 3, 1, '#e1d3ed');
  write(ctx, '潜意识伴侣契合度测试', 540, 1180, 870, 25, '#9d85b0', { align: 'center' });
  write(ctx, '12 个关系瞬间 · 看见具体需要 · 自我观察参考', 540, 1230, 900, 19, '#bbafc3', { align: 'center' });
  return finishImage(canvas, 'image/png', `伴侣画像-${r.name}.png`);
}

export async function createReportImage(report) {
  const r = report.result, art = await loadArt(r.id), blocks = [], width = 900, left = 68, textWidth = 764;
  const text = (value, size = 23, color = '#84708e', after = 20, options = {}) => blocks.push({ kind: 'text', value, size, color, after, ...options });
  const heading = (number, value) => { text(number + ' / 关系观察手册', 18, '#b1a0bc', 12, { before: 34 }); text(value, 30, '#715583', 24, { serif: true, weight: 500 }); };
  const card = (label, title, body, bg = '#f8f4fc') => blocks.push({ kind: 'card', label, title, body, bg, after: 17 });
  text('关 系 观 察 手 册  /  第二辑', 21, '#a68db8', 34, { align: 'center' });
  text('更值得了解的伴侣画像', 23, '#a68db8', 14, { align: 'center' });
  text(r.name, 45, '#74518f', 2, { align: 'center', serif: true, weight: 500 });
  blocks.push({ kind: 'art', height: 312, after: 9 });
  text(r.quote, 30, '#7b608d', 24, { align: 'center', serif: true });
  text('（' + r.profileLabel + '）', 19, '#a28ab5', 25, { align: 'center' });
  heading('02', '你真正想被怎样对待？'); text(r.explanation);
  for (const e of report.evidence) card(e.group + ' · ' + e.scene, '你的选择：' + e.choice, e.reading);
  if (report.nuance) card('还有一处选择，值得一起看', report.nuance.scene + '：' + report.nuance.choice, report.nuance.text, '#fcf8f2');
  if (report.groundedNote) text(report.groundedNote, 20, '#a08aa9');
  text(report.matchNote, 20, '#a08aa9');
  heading('03', '这类相处，值得谨慎');
  for (const item of r.risks) card('看是否反复发生，也看有没有调整', item.title, item.scene + '\n' + item.consequence, '#fcf6f2');
  heading('04', '这样的 ta，会怎样与你相处？');
  r.help.forEach((item, i) => card(String(i + 1).padStart(2, '0'), item.title, item.body));
  if (report.stories?.length) {
    heading('05', '在故事里，看见一种相处');
    text('三则故事，三个关系视角，慢慢读完。', 21, '#a08aa9');
    for (const story of report.stories) card(story.source, story.situation, story.body + '\n\n' + story.moment);
    text(report.storyNote || '', 17, '#b2a0bb', 21);
  }
  heading('06', '下一次，可以这样开口');
  card('少做一点', r.dont, '试着改成：' + r.do, '#f8f6f2');
  card('这句话可以直接带走', r.script, '记住：' + r.principle);
  heading('07', '未来一周，把观察变成选择');
  r.action.forEach((item, i) => text((i + 1) + '. ' + item, 23, '#806a8b', 18));
  text('这份结果怎样形成', 26, '#9378a5', 17, { before: 35, serif: true });
  text(report.methodNote + ' 采用自定义权重交叉比较相处反应与需要，未进行心理量表信效度验证。引用研究仅提供背景，不作为本测试准确性的证明。', 19, '#ac9ab5');
  text('研究背景：' + report.references.map(ref => ref.title).join('；'), 17, '#b5a6bf');
  text('本次 12 项选择', 26, '#9378a5', 20, { before: 24, serif: true });
  report.choices.forEach((item, i) => text(`${i + 1}. ${item.scene}\n${item.choice}`, 19, '#a18caa', 17));
  text('愿这份观察，帮你把下一次选择交回自己手里。', 21, '#a18aae', 12, { align: 'center', before: 28 });
  text('潜意识伴侣契合度测试 · 自我观察参考 · 非临床心理测评', 16, '#b9acc2', 0, { align: 'center' });

  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('当前浏览器无法生成图片。');
  let y = 74;
  for (const b of blocks) {
    y += b.before || 0; b.y = y;
    if (b.kind === 'art') b.height = 312;
    else if (b.kind === 'card') {
      measure.font = `18px ${FONT}`; b.labelLines = linesFor(measure, b.label, textWidth - 44);
      measure.font = `500 23px ${FONT}`; b.titleLines = linesFor(measure, b.title, textWidth - 44);
      measure.font = `21px ${FONT}`; b.bodyLines = linesFor(measure, b.body, textWidth - 44);
      b.height = 44 + b.labelLines.length * 29 + 10 + b.titleLines.length * 39 + 12 + b.bodyLines.length * 36;
    } else {
      measure.font = `${b.weight || 400} ${b.size}px ${b.serif ? SERIF : FONT}`;
      b.lines = linesFor(measure, b.value, textWidth); b.leading = Math.ceil(b.size * 1.75); b.height = b.lines.length * b.leading;
    }
    y += b.height + b.after;
  }
  const height = Math.ceil(y + 66), scale = Math.min(1, 14000 / height);
  const canvas = document.createElement('canvas'); canvas.width = Math.floor(width * scale); canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法生成图片。');
  ctx.scale(scale, scale); ctx.fillStyle = '#f5effb'; ctx.fillRect(0, 0, width, height);
  rounded(ctx, 25, 25, width - 50, height - 50, 27, '#fffefd');
  for (const b of blocks) {
    if (b.kind === 'art') { ctx.drawImage(art, 183, b.y, 534, 312); continue; }
    if (b.kind === 'card') {
      rounded(ctx, left, b.y, textWidth, b.height, 17, b.bg);
      let cardY = b.y + 20;
      cardY = write(ctx, b.label, left + 22, cardY, textWidth - 44, 18, '#a58cb7', { leading: 1.6 }) + 10;
      cardY = write(ctx, b.title, left + 22, cardY, textWidth - 44, 23, '#796187', { weight: 500, leading: 1.69 }) + 12;
      write(ctx, b.body, left + 22, cardY, textWidth - 44, 21, '#97829f', { leading: 1.71 });
      continue;
    }
    ctx.font = `${b.weight || 400} ${b.size}px ${b.serif ? SERIF : FONT}`; ctx.textAlign = b.align || 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = b.color;
    b.lines.forEach((line, i) => ctx.fillText(line, b.align === 'center' ? width / 2 : left, b.y + i * b.leading));
  }
  return finishImage(canvas, 'image/jpeg', `完整关系观察报告-${r.name}.jpg`);
}
