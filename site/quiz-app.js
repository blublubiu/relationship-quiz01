(() => {
  // site/story-logic.js
  function selectStories(stories = [], choices = []) {
    const ranked = stories.map((story, index) => {
      const clues = choices.filter((choice) => {
        var _a;
        return choice.optionId && (((_a = story.signals) == null ? void 0 : _a[choice.optionId]) || 0) > 0;
      });
      return { story, index, clues, score: clues.reduce((sum, choice) => sum + story.signals[choice.optionId], 0) };
    }).sort((a, b) => b.score - a.score || a.index - b.index);
    const lead = ranked[0];
    return {
      stories: ranked.map((item) => item.story),
      storyClue: (lead == null ? void 0 : lead.clues.length) ? { scene: lead.clues[0].scene, choice: lead.clues[0].choice } : null,
      storyMatch: (lead == null ? void 0 : lead.clues.length) ? "\u4ECE\u4F60\u9009\u8FC7\u7684\u76F8\u5904\u7247\u6BB5\u51FA\u53D1\uFF0C\u5148\u8BFB\u8FD9\u5219\u6545\u4E8B\uFF0C\u518D\u770B\u770B\u53E6\u4E24\u79CD\u5173\u7CFB\u89C6\u89D2\u3002" : "\u4E09\u5219\u6545\u4E8B\u63D0\u4F9B\u4E0D\u540C\u7684\u76F8\u5904\u89C6\u89D2\u3002\u53EF\u4EE5\u4ECE\u6700\u60F3\u8BFB\u7684\u4E00\u5219\u5F00\u59CB\uFF0C\u6545\u4E8B\u6807\u9898\u4E0D\u4EE3\u8868\u4F60\u4E00\u5B9A\u6709\u8FC7\u76F8\u540C\u7ECF\u5386\u3002"
    };
  }

  // site/quiz-engine.js
  var CONTENT_VERSION = "partner-v2-20261016";
  function validateContent(content) {
    var _a, _b;
    if (!content || content.version !== CONTENT_VERSION || ((_a = content.questions) == null ? void 0 : _a.length) !== 12 || ((_b = content.results) == null ? void 0 : _b.length) !== 6) throw new Error("\u7F51\u7AD9\u6B63\u5728\u66F4\u65B0\uFF0C\u8BF7\u7A0D\u540E\u5237\u65B0\uFF0C\u518D\u5F00\u59CB\u6D4B\u8BD5\u3002");
    const optionIds = /* @__PURE__ */ new Set();
    for (const q of content.questions) {
      if (!q.id || !Array.isArray(q.options) || q.options.length !== 4) throw new Error("\u9898\u76EE\u5185\u5BB9\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u8054\u7CFB\u5BA2\u670D\u3002");
      for (const option of q.options) {
        if (!option.id || optionIds.has(option.id) || !option.text || !option.reading) throw new Error("\u9898\u76EE\u5185\u5BB9\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u8054\u7CFB\u5BA2\u670D\u3002");
        optionIds.add(option.id);
        for (const values of [option.styles, option.needs]) if (!values || Object.values(values).some((v) => !Number.isFinite(v) || v < 0)) throw new Error("\u9898\u76EE\u5185\u5BB9\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u8054\u7CFB\u5BA2\u670D\u3002");
      }
    }
    return content;
  }
  function shuffledOptions(questions, seed) {
    let state = seed >>> 0;
    const random = () => {
      state += 1831565813;
      let t = state;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    return Object.fromEntries(questions.map((q) => {
      const ids = q.options.map((o) => o.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      return [q.id, ids];
    }));
  }
  function buildReport(content, answers, now = (/* @__PURE__ */ new Date()).toISOString()) {
    var _a;
    validateContent(content);
    const selected = content.questions.map((q) => {
      const option = q.options.find((o) => o.id === answers[q.id]);
      if (!option) throw new Error("\u8FD8\u6709\u9898\u76EE\u672A\u4F5C\u7B54\uFF0C\u8BF7\u5B8C\u6210\u5168\u90E8 12 \u9898\u3002");
      return { q, option };
    });
    const raw = { styles: {}, needs: {} }, maximum = { styles: {}, needs: {} };
    for (const { q, option } of selected) for (const kind of ["styles", "needs"]) {
      for (const [key, value] of Object.entries(option[kind])) raw[kind][key] = (raw[kind][key] || 0) + value;
      const keys = new Set(q.options.flatMap((o) => Object.keys(o[kind])));
      for (const key of keys) maximum[kind][key] = (maximum[kind][key] || 0) + Math.max(...q.options.map((o) => o[kind][key] || 0));
    }
    const fitFor = (weights, kind) => {
      const total = Object.values(weights).reduce((a, b) => a + b, 0);
      return Object.entries(weights).reduce((sum, [key, weight]) => sum + weight * (raw[kind][key] || 0) / (maximum[kind][key] || 1), 0) / (total || 1);
    };
    const preferenceOnly = /* @__PURE__ */ new Set(["q2", "q10", "q12"]);
    const candidates = content.results.map((result) => {
      const style = fitFor(result.fit.styles, "styles"), need = fitFor(result.fit.needs, "needs");
      const evidence2 = selected.map(({ q, option }) => ({ q, option, value: Object.entries(result.fit.needs).reduce((s, [key, w]) => s + (option.needs[key] || 0) * w, 0) + Object.entries(result.fit.styles).reduce((s, [key, w]) => s + (option.styles[key] || 0) * w * 0.6, 0) })).filter((e) => e.value > 0);
      const repairContexts = selected.filter(({ q, option }) => !preferenceOnly.has(q.id) && (option.needs.repair || 0) >= 2).length;
      return { result, style, need, evidence: evidence2, score: 0.42 * style + 0.58 * need, eligible: result.id !== "R5" || repairContexts >= 2 };
    }).filter((c) => c.eligible);
    candidates.sort((a, b) => b.score - a.score || b.need - a.need || a.result.id.localeCompare(b.result.id));
    let winner = candidates[0];
    const nearby = candidates.filter((c) => winner.score - c.score < 0.035);
    if (nearby.length > 1) winner = [...nearby].sort((a, b) => b.need - a.need || b.score - a.score || a.result.id.localeCompare(b.result.id))[0];
    const conflictRepairCount = selected.filter(({ q, option }) => q.group === "conflict" && (option.needs.repair || 0) >= 2).length;
    const prioritizeRepair = conflictRepairCount >= 3 && answers.q12 === "q12d";
    if (prioritizeRepair) winner = candidates.find((c) => c.result.id === "R5") || winner;
    const alternative = candidates.find((c) => c.result.id !== winner.result.id);
    const evidence = [], used = /* @__PURE__ */ new Set();
    const ordered = [...winner.evidence].sort((a, b) => b.value - a.value || Number(a.q.id.slice(1)) - Number(b.q.id.slice(1)));
    for (const group of content.groups) {
      const candidate = ordered.find((e) => e.q.group === group.id);
      if (candidate) {
        evidence.push(candidate);
        used.add(candidate.q.id);
      }
    }
    for (const candidate of ordered) {
      if (evidence.length >= 3) break;
      if (!used.has(candidate.q.id)) {
        evidence.push(candidate);
        used.add(candidate.q.id);
      }
    }
    const directChoices = selected.filter(({ option }) => (option.styles.collaborate || 0) >= 2);
    const counter = selected.find(({ option }) => {
      const dominantStyle = Object.keys(winner.result.fit.styles)[0];
      return Object.entries(option.styles).some(([key, val]) => val >= 2 && key !== dominantStyle && (key === "collaborate" || dominantStyle === "collaborate"));
    });
    const close = !!alternative && Math.abs(winner.score - alternative.score) < 0.09;
    const choices = selected.map(({ q, option }) => ({ questionId: q.id, optionId: option.id, scene: q.short, choice: option.text }));
    return {
      version: CONTENT_VERSION,
      createdAt: now,
      result: winner.result,
      evidence: evidence.map(({ q, option }) => ({ questionId: q.id, group: content.groups.find((g) => g.id === q.group).name, scene: q.short, question: q.prompt, choice: option.text, reading: option.reading })),
      nuance: counter ? { scene: counter.q.short, choice: counter.option.text, text: counter.option.reading } : null,
      matchNote: prioritizeRepair ? "\u4F60\u7684\u9009\u62E9\u5728\u591A\u4E2A\u51B2\u7A81\u60C5\u5883\u4E2D\u90FD\u6307\u5411\u4FEE\u590D\u7684\u9700\u8981\uFF0C\u5E76\u5728\u6700\u540E\u4E00\u9898\u518D\u6B21\u5F3A\u8C03\u4E86\u8FD9\u4E00\u70B9\uFF0C\u56E0\u6B64\u672C\u6B21\u4F18\u5148\u5448\u73B0\u51B2\u7A81\u4FEE\u590D\u65B9\u5411\u3002" : close ? `\u4F60\u7684\u9009\u62E9\u540C\u65F6\u5E26\u6709\u201C${alternative.result.name}\u201D\u7684\u7EBF\u7D22\u3002\u8FD9\u6B21\u4F18\u5148\u5448\u73B0\u66F4\u7A81\u51FA\u7684\u76F8\u5904\u9700\u8981\uFF0C\u53EF\u628A\u4E24\u79CD\u65B9\u5411\u90FD\u4F5C\u4E3A\u89C2\u5BDF\u70B9\u3002` : "\u8FD9\u4E2A\u63A8\u8350\u6765\u81EA\u591A\u9053\u60C5\u5883\u7684\u4EA4\u53C9\u7EBF\u7D22\u3002\u5B83\u662F\u4E0B\u4E00\u6B65\u89C2\u5BDF\u7684\u65B9\u5411\uFF0C\u9002\u914D\u4ECD\u9700\u8981\u53CC\u65B9\u771F\u5B9E\u76F8\u5904\u6765\u786E\u8BA4\u3002",
      secondaryName: close ? alternative.result.name : null,
      groundedNote: directChoices.length >= 3 ? "\u4F60\u5728\u591A\u4E2A\u60C5\u5883\u4E2D\u9009\u62E9\u4E86\u76F4\u63A5\u534F\u5546\u6216\u6709\u7EA6\u5B9A\u5730\u6682\u505C\u3002\u62A5\u544A\u4F1A\u4FDD\u7559\u8FD9\u90E8\u5206\u80FD\u529B\uFF1B\u5F53\u524D\u63A8\u8350\u4E0D\u7B49\u4E8E\u4F60\u6CA1\u6709\u8FB9\u754C\u6216\u4E0D\u4F1A\u5904\u7406\u5173\u7CFB\u3002" : "",
      choices,
      ...selectStories(((_a = content.stories) == null ? void 0 : _a[winner.result.id]) || [], choices),
      storyEdition: content.storyEdition || null,
      storyNote: content.storyNote || "",
      references: content.references,
      methodNote: content.methodNote
    };
  }

  // site/quiz-art.js
  var colors = {
    R1: ["#e9def4", "#b49ace", "#71558e", "#edc8b5"],
    R2: ["#e2ece5", "#abc3b5", "#557565", "#e7c9af"],
    R3: ["#f4e1e4", "#d6a4b0", "#9b6477", "#dfcfb0"],
    R4: ["#e2e8f2", "#afbbd5", "#687b9e", "#e2c6a3"],
    R5: ["#dceae9", "#a0c4c0", "#527f83", "#ded0ae"],
    R6: ["#f1e7d8", "#cdb694", "#96805e", "#bfceb7"]
  };
  function artMarkup(id = "R1") {
    const [pale, mid, ink, warm] = colors[id] || colors.R1;
    const shapes = {
      R1: `<ellipse cx="240" cy="231" rx="148" ry="12" fill="${pale}"/><path d="M108 205V135a77 77 0 0 1 154 0v70" fill="${mid}"/><path d="M217 204V143a63 63 0 0 1 126 0v61" fill="${warm}"/><path d="M134 191q104 50 211-9" fill="none" stroke="${ink}" stroke-width="3"/><path d="M176 144q27 33 54 0" fill="none" stroke="#fffaf5" stroke-width="3"/><circle cx="302" cy="84" r="18" fill="${pale}"/>`,
      R2: `<path d="M119 229V121a100 100 0 0 1 200 0v108" fill="${pale}"/><path d="M158 229V129a62 62 0 0 1 124 0v100" fill="${mid}"/><path d="M190 229V140a31 31 0 0 1 62 0v89" fill="#fffdf9"/><path d="M305 227q45-48 25-111M319 190q-47-8-28-36M329 169q39-27 35-45" fill="none" stroke="${ink}" stroke-width="2.5"/><ellipse cx="359" cy="98" rx="16" ry="24" transform="rotate(28 359 98)" fill="${warm}"/>`,
      R3: `<circle cx="240" cy="144" r="87" fill="${pale}"/><path d="M240 58l17 18 26-1 9 25 23 12-4 25 12 23-18 19-3 26-25 6-17 20-24-8-24 8-17-20-25-6-3-26-18-19 12-23-4-25 23-12 9-25 26 1Z" fill="none" stroke="${ink}" stroke-width="2"/><path d="M220 180v-59a20 20 0 0 1 40 0v59" fill="${mid}"/><circle cx="240" cy="136" r="6" fill="#fffdf9"/><path d="M240 143v17" stroke="#fffdf9" stroke-width="3"/><path d="M124 219h233" stroke="${warm}" stroke-width="3"/>`,
      R4: `<path d="M128 225l64-135 51 135M237 225l64-135 51 135" fill="${pale}"/><path d="M154 225l38-80 31 80M261 225l40-80 28 80" fill="${mid}"/><path d="M192 90l54-34 55 34" fill="none" stroke="${ink}" stroke-width="2"/><circle cx="192" cy="90" r="7" fill="${ink}"/><circle cx="301" cy="90" r="7" fill="${ink}"/><circle cx="246" cy="56" r="9" fill="${warm}"/><path d="M116 236h246" stroke="${ink}" stroke-width="2"/>`,
      R5: `<circle cx="240" cy="121" r="76" fill="${pale}"/><path d="M98 198q36-20 72 0t72 0t72 0t72 0M98 222q36-20 72 0t72 0t72 0t72 0" fill="none" stroke="${mid}" stroke-width="3"/><path d="M240 87v110m-49-48q0 50 49 50t49-50m-49 49-15-17m15 17 15-17" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><circle cx="240" cy="78" r="12" fill="none" stroke="${ink}" stroke-width="4"/><circle cx="339" cy="75" r="17" fill="${warm}"/>`,
      R6: `<circle cx="309" cy="78" r="29" fill="${warm}"/><path d="M84 226l109-122 62 69 51-43 91 96Z" fill="${pale}"/><path d="M169 226l91-119 130 119Z" fill="${mid}"/><path d="M236 226q72-39 15-62q-45-19 9-57" fill="none" stroke="#fffdf9" stroke-width="7"/><path d="M84 237h313M113 103q14-12 27 0m2-18q13-10 25 0" fill="none" stroke="${ink}" stroke-width="2"/>`
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 280" width="480" height="280" role="img" aria-label="\u62BD\u8C61\u5173\u7CFB\u63D2\u753B"><path d="M75 239h331" stroke="${pale}" stroke-width="1"/>${shapes[id] || shapes.R1}<path d="M88 61v18m-9-9h18m276 75v12m-6-6h12" stroke="${ink}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/></svg>`;
  }

  // site/quiz-export.js
  var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
  var SERIF = 'Georgia,"Songti SC","STSong","SimSun",serif';
  function rounded(ctx, x, y, w, h, radius, color) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, radius);
    else ctx.rect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fill();
  }
  function linesFor(ctx, text, width) {
    const lines = [];
    for (const paragraph of String(text != null ? text : "").split("\n")) {
      let line = "";
      for (const character of paragraph) {
        if (line && ctx.measureText(line + character).width > width) {
          lines.push(line);
          line = character;
        } else line += character;
      }
      lines.push(line);
    }
    return lines;
  }
  function write(ctx, text, x, y, width, size, color, options = {}) {
    const { weight = 400, align = "left", serif = false, leading = 1.7 } = options;
    ctx.font = `${weight} ${size}px ${serif ? SERIF : FONT}`;
    const lines = linesFor(ctx, text, width), lineHeight = Math.ceil(size * leading);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
    return y + lines.length * lineHeight;
  }
  async function loadArt(id) {
    const image = new Image();
    const promise = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("\u63D2\u753B\u6682\u65F6\u672A\u80FD\u751F\u6210\uFF0C\u8BF7\u91CD\u8BD5\u3002"));
    });
    image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(artMarkup(id));
    return promise;
  }
  function finishImage(canvas, type, fileName) {
    const dataUrl = canvas.toDataURL(type, 0.95);
    if (!dataUrl.startsWith("data:image/")) throw new Error("\u56FE\u7247\u8FC7\u957F\uFF0C\u8BF7\u91CD\u8BD5\u751F\u6210\u3002");
    return { dataUrl, fileName, width: canvas.width, height: canvas.height, type };
  }
  async function createShareImage(report2) {
    const r = report2.result, image = await loadArt(r.id), canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("\u5F53\u524D\u6D4F\u89C8\u5668\u65E0\u6CD5\u751F\u6210\u56FE\u7247\u3002");
    ctx.fillStyle = "#f6f0fb";
    ctx.fillRect(0, 0, 1080, 1350);
    rounded(ctx, 43, 43, 994, 1264, 38, "#fffefd");
    write(ctx, "\u5173 \u7CFB \u89C2 \u5BDF \u624B \u518C  /  LOVE, IN REAL LIFE", 540, 113, 880, 22, "#ae9abe", { align: "center" });
    write(ctx, "\u66F4\u503C\u5F97\u4E86\u89E3\u7684\u4F34\u4FA3\u753B\u50CF", 540, 194, 880, 25, "#a18ab5", { align: "center" });
    write(ctx, r.name, 540, 250, 880, 61, "#74518f", { align: "center", serif: true, weight: 500 });
    ctx.drawImage(image, 202, 337, 676, 394);
    let y = write(ctx, r.quote, 540, 768, 805, 39, "#7b638a", { align: "center", serif: true, leading: 1.8 });
    y = Math.max(y + 66, 1003);
    write(ctx, r.keywords.join("  \xB7  "), 540, y, 880, 23, "#ab94bc", { align: "center" });
    rounded(ctx, 481, 1128, 118, 3, 1, "#e1d3ed");
    write(ctx, "\u6F5C\u610F\u8BC6\u4F34\u4FA3\u5951\u5408\u5EA6\u6D4B\u8BD5", 540, 1180, 870, 25, "#9d85b0", { align: "center" });
    write(ctx, "12 \u4E2A\u5173\u7CFB\u77AC\u95F4 \xB7 \u770B\u89C1\u5177\u4F53\u9700\u8981 \xB7 \u81EA\u6211\u89C2\u5BDF\u53C2\u8003", 540, 1230, 900, 19, "#bbafc3", { align: "center" });
    return finishImage(canvas, "image/png", `\u4F34\u4FA3\u753B\u50CF-${r.name}.png`);
  }
  async function createReportImage(report2) {
    var _a;
    const r = report2.result, art = await loadArt(r.id), blocks = [], width = 900, left = 68, textWidth = 764;
    const text = (value, size = 23, color = "#84708e", after = 20, options = {}) => blocks.push({ kind: "text", value, size, color, after, ...options });
    const heading = (number, value) => {
      text(number + " / \u5173\u7CFB\u89C2\u5BDF\u624B\u518C", 18, "#b1a0bc", 12, { before: 34 });
      text(value, 30, "#715583", 24, { serif: true, weight: 500 });
    };
    const card = (label, title, body, bg = "#f8f4fc") => blocks.push({ kind: "card", label, title, body, bg, after: 17 });
    text("\u5173 \u7CFB \u89C2 \u5BDF \u624B \u518C  /  \u7B2C\u4E8C\u8F91", 21, "#a68db8", 34, { align: "center" });
    text("\u66F4\u503C\u5F97\u4E86\u89E3\u7684\u4F34\u4FA3\u753B\u50CF", 23, "#a68db8", 14, { align: "center" });
    text(r.name, 45, "#74518f", 2, { align: "center", serif: true, weight: 500 });
    blocks.push({ kind: "art", height: 312, after: 9 });
    text(r.quote, 30, "#7b608d", 24, { align: "center", serif: true });
    text(r.keywords.join(" \xB7 "), 19, "#a28ab5", 25, { align: "center" });
    text(r.intro, 24);
    heading("02", "\u4F60\u771F\u6B63\u60F3\u88AB\u600E\u6837\u5BF9\u5F85\uFF1F");
    text(r.explanation);
    for (const e of report2.evidence) card(e.group + " \xB7 " + e.scene, "\u4F60\u7684\u9009\u62E9\uFF1A" + e.choice, e.reading);
    if (report2.nuance) card("\u8FD8\u6709\u4E00\u5904\u9009\u62E9\uFF0C\u503C\u5F97\u4E00\u8D77\u770B", report2.nuance.scene + "\uFF1A" + report2.nuance.choice, report2.nuance.text, "#fcf8f2");
    if (report2.groundedNote) text(report2.groundedNote, 20, "#a08aa9");
    text(report2.matchNote, 20, "#a08aa9");
    heading("03", "\u8FD9\u7C7B\u76F8\u5904\uFF0C\u503C\u5F97\u8C28\u614E");
    for (const item of r.risks) card("\u770B\u662F\u5426\u53CD\u590D\u53D1\u751F\uFF0C\u4E5F\u770B\u6709\u6CA1\u6709\u8C03\u6574", item.title, item.scene + "\n" + item.consequence, "#fcf6f2");
    heading("04", "\u8FD9\u6837\u7684 ta\uFF0C\u4F1A\u600E\u6837\u4E0E\u4F60\u76F8\u5904\uFF1F");
    r.help.forEach((item, i) => card(String(i + 1).padStart(2, "0"), item.title, item.body));
    if ((_a = report2.stories) == null ? void 0 : _a.length) {
      heading("05", "\u5728\u6545\u4E8B\u91CC\uFF0C\u770B\u89C1\u4E00\u79CD\u76F8\u5904");
      text("\u4E09\u5219\u6545\u4E8B\uFF0C\u4E09\u4E2A\u5173\u7CFB\u89C6\u89D2\uFF0C\u6162\u6162\u8BFB\u5B8C\u3002", 21, "#a08aa9");
      for (const story of report2.stories) card(story.source, story.situation, story.body + "\n\n" + story.moment);
      text(report2.storyNote || "", 17, "#b2a0bb", 21);
    }
    heading("06", "\u4E0B\u4E00\u6B21\uFF0C\u53EF\u4EE5\u8FD9\u6837\u5F00\u53E3");
    card("\u5C11\u505A\u4E00\u70B9", r.dont, "\u8BD5\u7740\u6539\u6210\uFF1A" + r.do, "#f8f6f2");
    card("\u8FD9\u53E5\u8BDD\u53EF\u4EE5\u76F4\u63A5\u5E26\u8D70", r.script, "\u8BB0\u4F4F\uFF1A" + r.principle);
    heading("07", "\u672A\u6765\u4E00\u5468\uFF0C\u628A\u89C2\u5BDF\u53D8\u6210\u9009\u62E9");
    r.action.forEach((item, i) => text(i + 1 + ". " + item, 23, "#806a8b", 18));
    text("\u8FD9\u4EFD\u7ED3\u679C\u600E\u6837\u5F62\u6210", 26, "#9378a5", 17, { before: 35, serif: true });
    text(report2.methodNote + " \u91C7\u7528\u81EA\u5B9A\u4E49\u6743\u91CD\u4EA4\u53C9\u6BD4\u8F83\u76F8\u5904\u53CD\u5E94\u4E0E\u9700\u8981\uFF0C\u672A\u8FDB\u884C\u5FC3\u7406\u91CF\u8868\u4FE1\u6548\u5EA6\u9A8C\u8BC1\u3002\u5F15\u7528\u7814\u7A76\u4EC5\u63D0\u4F9B\u80CC\u666F\uFF0C\u4E0D\u4F5C\u4E3A\u672C\u6D4B\u8BD5\u51C6\u786E\u6027\u7684\u8BC1\u660E\u3002", 19, "#ac9ab5");
    text("\u7814\u7A76\u80CC\u666F\uFF1A" + report2.references.map((ref) => ref.title).join("\uFF1B"), 17, "#b5a6bf");
    text("\u672C\u6B21 12 \u9879\u9009\u62E9", 26, "#9378a5", 20, { before: 24, serif: true });
    report2.choices.forEach((item, i) => text(`${i + 1}. ${item.scene}
${item.choice}`, 19, "#a18caa", 17));
    text("\u613F\u8FD9\u4EFD\u89C2\u5BDF\uFF0C\u5E2E\u4F60\u628A\u4E0B\u4E00\u6B21\u9009\u62E9\u4EA4\u56DE\u81EA\u5DF1\u624B\u91CC\u3002", 21, "#a18aae", 12, { align: "center", before: 28 });
    text("\u6F5C\u610F\u8BC6\u4F34\u4FA3\u5951\u5408\u5EA6\u6D4B\u8BD5 \xB7 \u81EA\u6211\u89C2\u5BDF\u53C2\u8003 \xB7 \u975E\u4E34\u5E8A\u5FC3\u7406\u6D4B\u8BC4", 16, "#b9acc2", 0, { align: "center" });
    const measure = document.createElement("canvas").getContext("2d");
    if (!measure) throw new Error("\u5F53\u524D\u6D4F\u89C8\u5668\u65E0\u6CD5\u751F\u6210\u56FE\u7247\u3002");
    let y = 74;
    for (const b of blocks) {
      y += b.before || 0;
      b.y = y;
      if (b.kind === "art") b.height = 312;
      else if (b.kind === "card") {
        measure.font = `18px ${FONT}`;
        b.labelLines = linesFor(measure, b.label, textWidth - 44);
        measure.font = `500 23px ${FONT}`;
        b.titleLines = linesFor(measure, b.title, textWidth - 44);
        measure.font = `21px ${FONT}`;
        b.bodyLines = linesFor(measure, b.body, textWidth - 44);
        b.height = 44 + b.labelLines.length * 29 + 10 + b.titleLines.length * 39 + 12 + b.bodyLines.length * 36;
      } else {
        measure.font = `${b.weight || 400} ${b.size}px ${b.serif ? SERIF : FONT}`;
        b.lines = linesFor(measure, b.value, textWidth);
        b.leading = Math.ceil(b.size * 1.75);
        b.height = b.lines.length * b.leading;
      }
      y += b.height + b.after;
    }
    const height = Math.ceil(y + 66), scale = Math.min(1, 14e3 / height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("\u5F53\u524D\u6D4F\u89C8\u5668\u65E0\u6CD5\u751F\u6210\u56FE\u7247\u3002");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#f5effb";
    ctx.fillRect(0, 0, width, height);
    rounded(ctx, 25, 25, width - 50, height - 50, 27, "#fffefd");
    for (const b of blocks) {
      if (b.kind === "art") {
        ctx.drawImage(art, 183, b.y, 534, 312);
        continue;
      }
      if (b.kind === "card") {
        rounded(ctx, left, b.y, textWidth, b.height, 17, b.bg);
        let cardY = b.y + 20;
        cardY = write(ctx, b.label, left + 22, cardY, textWidth - 44, 18, "#a58cb7", { leading: 1.6 }) + 10;
        cardY = write(ctx, b.title, left + 22, cardY, textWidth - 44, 23, "#796187", { weight: 500, leading: 1.69 }) + 12;
        write(ctx, b.body, left + 22, cardY, textWidth - 44, 21, "#97829f", { leading: 1.71 });
        continue;
      }
      ctx.font = `${b.weight || 400} ${b.size}px ${b.serif ? SERIF : FONT}`;
      ctx.textAlign = b.align || "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = b.color;
      b.lines.forEach((line, i) => ctx.fillText(line, b.align === "center" ? width / 2 : left, b.y + i * b.leading));
    }
    return finishImage(canvas, "image/jpeg", `\u5B8C\u6574\u5173\u7CFB\u89C2\u5BDF\u62A5\u544A-${r.name}.jpg`);
  }

  // site/story-theater.js
  function createStoryTheater(report2) {
    const root = document.createElement("section");
    root.className = "report-module story-feature";
    root.setAttribute("aria-label", "\u5173\u7CFB\u6545\u4E8B\u9009\u8BFB");
    root.innerHTML = '<div class="module-kicker">05 / \u5173\u7CFB\u6545\u4E8B\u9009\u8BFB</div><h2 class="module-heading">\u5728\u6545\u4E8B\u91CC\uFF0C\u770B\u89C1\u4E00\u79CD\u76F8\u5904</h2><p class="story-match">\u4E09\u5219\u6545\u4E8B\uFF0C\u4E09\u4E2A\u5173\u7CFB\u89C6\u89D2\uFF0C\u6162\u6162\u8BFB\u5B8C\u3002</p>';
    for (const [index, story] of report2.stories.entries()) {
      const card = document.createElement("article");
      card.className = "reading-story";
      for (const [tag, cls, value] of [["h3", "reading-source", story.source], ["h4", "reading-situation", story.situation], ["p", "reading-body", story.body], ["p", "reading-moment", story.moment]]) {
        const el = document.createElement(tag);
        el.className = cls;
        el.textContent = value;
        card.append(el);
      }
      root.append(card);
    }
    const note = document.createElement("p");
    note.className = "story-note";
    note.textContent = report2.storyNote || "";
    root.append(note);
    return { element: root, pause() {
    }, destroy() {
    } };
  }

  // site/quiz.js
  var $ = (selector) => document.querySelector(selector);
  var esc = (value) => String(value != null ? value : "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var SESSION_KEY = "partner-quiz-active-v2";
  var REPORT_KEY = "partner-quiz-last-report-v2";
  var config = window.RELATIONSHIP_QUIZ_CONFIG || {};
  var localPreview = Boolean(config.localPreview && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname));
  var session = null;
  var report = null;
  var advanceTimer = null;
  var activeModal = null;
  var returnFocus = null;
  var exporting = false;
  var imageFile = null;
  var lastReviewIndex = -1;
  var storyTheater = null;
  function readStorage(storage, key) {
    try {
      return JSON.parse(storage.getItem(key) || "null");
    } catch (e) {
      return null;
    }
  }
  function saveStorage(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (e) {
    }
  }
  function getLastReport() {
    var _a;
    try {
      const r = readStorage(localStorage, REPORT_KEY);
      return (r == null ? void 0 : r.version) === CONTENT_VERSION && ((_a = r == null ? void 0 : r.result) == null ? void 0 : _a.name) && Array.isArray(r.evidence) ? r : null;
    } catch (e) {
      return null;
    }
  }
  function persist() {
    try {
      if (session) saveStorage(sessionStorage, SESSION_KEY, session);
    } catch (e) {
    }
  }
  function showView(id) {
    clearTimeout(advanceTimer);
    if (id !== "result") storyTheater == null ? void 0 : storyTheater.pause();
    for (const view of ["gate", "quiz", "result"]) $("#" + view).classList.toggle("hidden", view !== id);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  function toast(text) {
    $("#toast").textContent = text;
    $("#toast").classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
  }
  async function apiRequest(path, payload, signal) {
    if (!localPreview && (!config.supabaseUrl || !config.publishableKey)) throw new Error("\u6D4B\u8BD5\u670D\u52A1\u5C1A\u672A\u914D\u7F6E\uFF0C\u8BF7\u8054\u7CFB\u5E97\u94FA\u5BA2\u670D\u3002");
    const url = localPreview ? "/api/" + path : config.supabaseUrl.replace(/\/$/, "") + "/functions/v1/quiz-api/api/" + path;
    const headers = { "Content-Type": "application/json" };
    if (!localPreview) headers.apikey = config.publishableKey;
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "\u6682\u65F6\u65E0\u6CD5\u5F00\u59CB\u6D4B\u8BD5\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002");
    return data;
  }
  async function startRequest(code, signal) {
    const data = await apiRequest("start", { code, content_version: CONTENT_VERSION }, signal);
    validateContent(data.content);
    return data;
  }
  $("#gateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if ($("#begin").disabled) return;
    const code = $("#password").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 12) {
      $("#gateError").textContent = "\u8BF7\u8F93\u5165\u8D2D\u4E70\u540E\u6536\u5230\u7684 12 \u4F4D\u5BC6\u7801\uFF0C\u5B57\u6BCD\u548C\u6570\u5B57\u5747\u53EF\uFF0C\u6A2A\u7EBF\u53EF\u7701\u7565\u3002";
      return;
    }
    const button = $("#begin"), controller = new AbortController();
    button.disabled = true;
    button.textContent = "\u6B63\u5728\u9A8C\u8BC1\u5E76\u52A0\u8F7D\u2026";
    $("#gateError").textContent = "\u8FDE\u63A5\u6210\u529F\u540E\uFF0C12 \u9898\u548C\u5B8C\u6574\u62A5\u544A\u5C06\u4E00\u6B21\u52A0\u8F7D\u3002";
    const slow = setTimeout(() => {
      $("#gateError").textContent = "\u8FDE\u63A5\u7A0D\u6162\uFF0C\u8BF7\u5148\u4FDD\u6301\u672C\u9875\u6253\u5F00\uFF0C\u907F\u514D\u91CD\u590D\u70B9\u51FB\u3002";
    }, 5e3);
    const timeout = setTimeout(() => controller.abort(), 3e4);
    try {
      const data = await startRequest(code, controller.signal);
      const random = crypto.getRandomValues(new Uint32Array(1))[0];
      session = { version: CONTENT_VERSION, content: data.content, answers: {}, index: 0, presentation: shuffledOptions(data.content.questions, random), remaining: data.remaining, completed: false, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      report = null;
      persist();
      renderQuestion();
      showView("quiz");
      $("#password").value = "";
    } catch (error) {
      $("#gateError").textContent = error.name === "AbortError" || error instanceof TypeError ? "\u8FDE\u63A5\u6682\u65F6\u4E2D\u65AD\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002\u5982\u53EF\u7528\u6B21\u6570\u51FA\u73B0\u53D8\u5316\uFF0C\u8BF7\u8054\u7CFB\u5BA2\u670D\u6838\u5BF9\u3002" : error.message;
    } finally {
      clearTimeout(slow);
      clearTimeout(timeout);
      button.disabled = false;
      button.innerHTML = '\u9A8C\u8BC1\u5BC6\u7801\uFF0C\u5F00\u59CB\u6D4B\u8BD5 <span aria-hidden="true">\u2197</span>';
    }
  });
  window.quizEntryReady = true;
  function renderQuestion() {
    const q = session.content.questions[session.index], group = session.content.groups.find((g) => g.id === q.group);
    $("#groupName").textContent = group.name;
    $("#groupCaption").textContent = group.caption;
    $("#questionCount").textContent = `${String(session.index + 1).padStart(2, "0")} / 12`;
    $("#question").textContent = q.prompt;
    $("#progressFill").style.width = (session.index + 1) / 12 * 100 + "%";
    $(".progress-track").setAttribute("aria-valuenow", String(session.index + 1));
    const container = $("#answers");
    container.replaceChildren();
    session.presentation[q.id].forEach((id, position) => {
      const option = q.options.find((o) => o.id === id), button = document.createElement("button");
      button.type = "button";
      button.className = "answer" + (session.answers[q.id] === id ? " selected" : "");
      button.setAttribute("aria-pressed", String(session.answers[q.id] === id));
      button.dataset.option = id;
      const letter = document.createElement("span");
      letter.className = "answer-letter";
      letter.textContent = "ABCD"[position];
      letter.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.textContent = option.text;
      button.append(letter, text);
      button.addEventListener("click", () => chooseOption(id));
      container.append(button);
    });
    $("#prev").disabled = session.index === 0;
    $("#next").disabled = !session.answers[q.id];
    $("#next").textContent = session.index === 11 ? "\u67E5\u770B\u6211\u7684\u62A5\u544A \u2192" : "\u4E0B\u4E00\u9898 \u2192";
    persist();
  }
  function chooseOption(id) {
    clearTimeout(advanceTimer);
    const q = session.content.questions[session.index];
    session.answers[q.id] = id;
    persist();
    for (const button of $("#answers").children) {
      const selected = button.dataset.option === id;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    $("#next").disabled = false;
    const chosenIndex = session.index;
    advanceTimer = setTimeout(() => {
      if (session.index === chosenIndex && !$("#quiz").classList.contains("hidden")) nextQuestion();
    }, 340);
  }
  function nextQuestion() {
    clearTimeout(advanceTimer);
    if (!session.answers[session.content.questions[session.index].id]) return;
    if (session.index < 11) {
      session.index++;
      renderQuestion();
      $("#question").focus({ preventScroll: true });
    } else {
      try {
        report = buildReport(session.content, session.answers);
        session.completed = true;
        persist();
        try {
          saveStorage(localStorage, REPORT_KEY, report);
        } catch (e) {
        }
        renderReport(report);
        showView("result");
      } catch (error) {
        toast(error.message);
      }
    }
  }
  $("#prev").addEventListener("click", () => {
    clearTimeout(advanceTimer);
    if (session.index > 0) {
      session.index--;
      renderQuestion();
    }
  });
  $("#next").addEventListener("click", nextQuestion);
  function safeLink(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" ? esc(parsed.href) : "#";
    } catch (e) {
      return "#";
    }
  }
  function renderReport(value) {
    var _a;
    storyTheater == null ? void 0 : storyTheater.destroy();
    storyTheater = null;
    report = value;
    const r = report.result;
    $("#resultBody").innerHTML = `
    <article class="report-module report-hero">
      <div class="module-kicker">01 / \u66F4\u503C\u5F97\u4E86\u89E3\u7684\u4F34\u4FA3\u753B\u50CF</div>
      <p class="result-label">\u4E0E\u4F60\u8FD9\u6B21\u76F8\u5904\u9700\u8981\u66F4\u8D34\u8FD1\u7684\uFF0C\u662F</p>
      <h1 class="result-name">${esc(r.name)}</h1>
      <div class="report-art" aria-hidden="true">${artMarkup(r.id)}</div>
      <blockquote class="result-quote">${esc(r.quote)}</blockquote>
      <div class="result-keywords">${r.keywords.map((k) => `<span>${esc(k)}</span>`).join("")}</div>
      <p class="result-intro">${esc(r.intro)}</p>
    </article>
    <article class="report-module">
      <div class="module-kicker">02 / \u4ECE\u4F60\u7684\u9009\u62E9\u51FA\u53D1</div><h2 class="module-heading">\u4F60\u771F\u6B63\u60F3\u88AB\u600E\u6837\u5BF9\u5F85\uFF1F</h2>
      <p>${esc(r.explanation)}</p>
      <div class="evidence-list">${report.evidence.map((e, i) => `<article class="evidence-card"><div class="evidence-top"><span>${esc(e.group)}</span><span>\u7EBF\u7D22 ${String(i + 1).padStart(2, "0")}</span></div><h3>${esc(e.scene)}</h3><blockquote>${esc(e.choice)}</blockquote><p>${esc(e.reading)}</p></article>`).join("")}</div>
      ${report.nuance ? `<aside class="nuance"><strong>\u8FD8\u6709\u4E00\u5904\u9009\u62E9\uFF0C\u503C\u5F97\u4E00\u8D77\u770B</strong><p>\u5728\u201C${esc(report.nuance.scene)}\u201D\u91CC\uFF0C\u4F60\u9009\u4E86\uFF1A${esc(report.nuance.choice)}</p><p>${esc(report.nuance.text)}</p></aside>` : ""}
      ${report.groundedNote ? `<p>${esc(report.groundedNote)}</p>` : ""}<p class="match-note">${esc(report.matchNote)}</p>
    </article>
    <article class="report-module"><div class="module-kicker">03 / \u907F\u5751\u6307\u5357</div><h2 class="module-heading">\u8FD9\u7C7B\u76F8\u5904\uFF0C\u503C\u5F97\u8C28\u614E</h2><p>\u770B\u662F\u5426\u53CD\u590D\u53D1\u751F\uFF0C\u4E5F\u770B\u63D0\u51FA\u4E4B\u540E\u6709\u6CA1\u6709\u5B9E\u9645\u8C03\u6574\u3002</p><div class="risk-grid">${r.risks.map((item) => `<div class="risk-card"><span class="risk-icon" aria-hidden="true">\u2198</span><h3>${esc(item.title)}</h3><p>${esc(item.scene)}</p><p class="consequence">${esc(item.consequence)}</p></div>`).join("")}</div></article>
    <article class="report-module"><div class="module-kicker">04 / \u628A\u9002\u914D\u843D\u5230\u884C\u52A8</div><h2 class="module-heading">\u8FD9\u6837\u7684 ta\uFF0C\u4F1A\u600E\u6837\u4E0E\u4F60\u76F8\u5904\uFF1F</h2><div class="help-grid">${r.help.map((item, i) => `<div class="help-item"><span class="help-number">${String(i + 1).padStart(2, "0")}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></div></div>`).join("")}</div></article>
    <div id="storyMount"></div><article class="report-module"><div class="module-kicker">06 / \u6C9F\u901A\u4E0E\u76F8\u5904\u6307\u5357</div><h2 class="module-heading">\u4E0B\u4E00\u6B21\uFF0C\u53EF\u4EE5\u8FD9\u6837\u5F00\u53E3</h2><div class="practice-grid"><div class="practice"><strong>\u5C11\u505A\u4E00\u70B9</strong><p>${esc(r.dont)}</p></div><div class="practice positive"><strong>\u8BD5\u7740\u6539\u6210</strong><p>${esc(r.do)}</p></div></div><div class="script-box"><small>\u628A\u9700\u8981\u8BF4\u5177\u4F53 \xB7 \u8FD9\u53E5\u8BDD\u53EF\u4EE5\u76F4\u63A5\u5E26\u8D70</small><blockquote>${esc(r.script)}</blockquote><button id="copyScript" class="copy-script" type="button">\u590D\u5236\u8FD9\u53E5\u8BDD</button></div><p class="principle">\u8BB0\u4F4F\uFF1A${esc(r.principle)}</p></article>
    <article class="report-module kit"><div class="module-kicker">07 / \u4F60\u7684\u4E13\u5C5E\u6E05\u9192\u9526\u56CA</div><h2 class="module-heading">\u672A\u6765\u4E00\u5468\uFF0C\u628A\u89C2\u5BDF\u53D8\u6210\u9009\u62E9</h2><ul class="action-list">${r.action.map((item) => `<li><span class="action-check" aria-hidden="true"></span><span>${esc(item)}</span></li>`).join("")}</ul>
      <details class="report-method"><summary>\u8FD9\u4EFD\u7ED3\u679C\u600E\u6837\u5F62\u6210 \xB7 \u67E5\u770B\u672C\u6B21 12 \u9879\u9009\u62E9</summary><p>${esc(report.methodNote)}</p><p>\u672C\u6D4B\u8BD5\u7528\u81EA\u5B9A\u4E49\u6743\u91CD\u4EA4\u53C9\u6BD4\u8F83\u76F8\u5904\u53CD\u5E94\u4E0E\u9700\u8981\uFF0C\u4F18\u5148\u5F15\u7528\u4E0D\u540C\u60C5\u5883\u4E2D\u7684\u5B9E\u9645\u9009\u9879\uFF1B\u63A5\u8FD1\u7684\u7ED3\u679C\u4F1A\u660E\u786E\u63D0\u793A\u3002\u652F\u6301\u504F\u597D\u4E0E\u5047\u8BBE\u9898\u4E0D\u7528\u4E8E\u5355\u72EC\u5224\u5B9A\u884C\u4E3A\u6A21\u5F0F\u3002\u9898\u5E93\u672A\u8FDB\u884C\u5FC3\u7406\u91CF\u8868\u4FE1\u6548\u5EA6\u9A8C\u8BC1\uFF0C\u4E0D\u8F93\u51FA\u8BCA\u65AD\u6216\u201C\u5951\u5408\u7387\u201D\u3002</p><p>\u4EE5\u4E0B\u7814\u7A76\u4EC5\u7528\u4E8E\u7406\u89E3\u5173\u7CFB\u56DE\u5E94\u4E0E\u4F9D\u604B\u7814\u7A76\u80CC\u666F\uFF0C\u5E76\u975E\u672C\u6D4B\u8BD5\u51C6\u786E\u6027\u7684\u80CC\u4E66\u3002</p><ul>${report.references.map((ref) => `<li><a href="${safeLink(ref.url)}" target="_blank" rel="noopener noreferrer">${esc(ref.title)}</a>\uFF1A${esc(ref.note)}</li>`).join("")}</ul><div class="all-choices">${report.choices.map((item, i) => `<p><b>${i + 1}. ${esc(item.scene)}</b><br>${esc(item.choice)}</p>`).join("")}</div></details>
    </article>`;
    $("#copyScript").addEventListener("click", () => copyText(r.script, "\u8FD9\u53E5\u8BDD\u5DF2\u590D\u5236"));
    if (((_a = report.stories) == null ? void 0 : _a.length) === 3) {
      storyTheater = createStoryTheater(report);
      $("#storyMount").append(storyTheater.element);
    } else {
      $("#storyMount").innerHTML = '<section class="story-upgrade"><span class="story-eyebrow">THE STORY CONTINUES</span><h2>\u7ED9\u8FD9\u4EFD\u62A5\u544A\uFF0C\u8865\u4E0A\u4E09\u5219\u6545\u4E8B</h2><p>\u8FD9\u662F\u4F60\u5728\u66F4\u65B0\u524D\u4FDD\u5B58\u7684\u7ED3\u679C\u3002\u8F93\u5165\u539F\u5BC6\u7801\u5373\u53EF\u8865\u5145\u6545\u4E8B\uFF0C\u4E0D\u6263\u6D4B\u8BD5\u6B21\u6570\uFF1B\u539F\u6765\u7684\u5206\u6790\u4F1A\u7EE7\u7EED\u4FDD\u7559\u3002</p><form id="storyUpgradeForm"><input id="storyUpgradeCode" type="text" aria-label="\u7528\u4E8E\u8865\u5145\u6545\u4E8B\u7684\u539F\u6D4B\u8BD5\u5BC6\u7801" placeholder="\u8F93\u5165\u539F\u6D4B\u8BD5\u5BC6\u7801" autocomplete="off" autocapitalize="characters" maxlength="40" required><button class="btn secondary" type="submit">\u8865\u5145\u6545\u4E8B \xB7 \u4E0D\u6263\u6B21</button></form><div id="storyUpgradeStatus" role="status"></div></section>';
      $("#storyUpgradeForm").addEventListener("submit", async (event) => {
        var _a2;
        event.preventDefault();
        const code = $("#storyUpgradeCode").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (code.length !== 12) {
          $("#storyUpgradeStatus").textContent = "\u8BF7\u8F93\u5165\u539F\u6765\u7684 12 \u4F4D\u6D4B\u8BD5\u5BC6\u7801\u3002";
          return;
        }
        const button = $("#storyUpgradeForm button"), status = $("#storyUpgradeStatus"), controller = new AbortController();
        button.disabled = true;
        status.textContent = "\u6B63\u5728\u8865\u5145\u6545\u4E8B\uFF0C\u4E0D\u4F1A\u6263\u9664\u6B21\u6570\u2026";
        const timeout = setTimeout(() => controller.abort(), 3e4);
        try {
          const data = await apiRequest("stories", { code, result_id: report.result.id }, controller.signal);
          if (((_a2 = data.stories) == null ? void 0 : _a2.length) !== 3) throw new Error("\u6545\u4E8B\u5185\u5BB9\u6682\u672A\u5C31\u7EEA\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002");
          const choices = report.choices.map((choice) => {
            var _a3;
            return { ...choice, optionId: choice.optionId || ((_a3 = data.optionLookup) == null ? void 0 : _a3[choice.choice]) };
          });
          const updated = { ...report, choices, ...selectStories(data.stories, choices), storyEdition: data.storyEdition, storyNote: data.storyNote };
          try {
            saveStorage(localStorage, REPORT_KEY, updated);
          } catch (e) {
          }
          if (session == null ? void 0 : session.content) {
            session.content.stories = { ...session.content.stories, [report.result.id]: data.stories };
            session.content.storyEdition = data.storyEdition;
            session.content.storyNote = data.storyNote;
            persist();
          }
          renderReport(updated);
          toast("\u4E09\u5219\u6545\u4E8B\u5DF2\u8865\u5145\uFF0C\u6CA1\u6709\u6263\u9664\u6D4B\u8BD5\u6B21\u6570");
        } catch (error) {
          status.textContent = error.name === "AbortError" || error instanceof TypeError ? "\u8FDE\u63A5\u6682\u65F6\u4E2D\u65AD\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002\u672C\u6B21\u4E0D\u6263\u6B21\u3002" : error.message;
        } finally {
          clearTimeout(timeout);
          button.disabled = false;
        }
      });
    }
  }
  $("#restart").addEventListener("click", () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
    }
    session = null;
    $("#gateError").textContent = "\u5F00\u59CB\u65B0\u4E00\u8F6E\u4F1A\u4F7F\u7528 1 \u6B21\u673A\u4F1A\uFF1B\u67E5\u770B\u5DF2\u4FDD\u5B58\u7684\u7ED3\u679C\u4E0D\u4F1A\u6263\u6B21\u3002";
    $("#lastResult").classList.toggle("hidden", !getLastReport());
    showView("gate");
    $("#password").focus();
  });
  $("#lastResult").addEventListener("click", () => {
    const saved = getLastReport();
    if (saved) {
      renderReport(saved);
      showView("result");
    }
  });
  async function copyText(text, success) {
    var _a;
    try {
      if ((_a = navigator.clipboard) == null ? void 0 : _a.writeText) await navigator.clipboard.writeText(text);
      else throw new Error("fallback");
      toast(success);
    } catch (e) {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.cssText = "position:fixed;left:0;top:0;opacity:.01";
      document.body.append(field);
      field.select();
      field.setSelectionRange(0, field.value.length);
      const copied = document.execCommand("copy");
      field.remove();
      toast(copied ? success : "\u8BF7\u957F\u6309\u6587\u5B57\u624B\u52A8\u590D\u5236");
    }
  }
  function openModal(id) {
    var _a;
    storyTheater == null ? void 0 : storyTheater.pause();
    returnFocus = document.activeElement;
    activeModal = id;
    $("#" + id).classList.remove("hidden");
    document.body.classList.add("modal-open");
    (_a = $("#" + id + " button")) == null ? void 0 : _a.focus();
  }
  function closeModal() {
    if (!activeModal) return;
    $("#" + activeModal).classList.add("hidden");
    activeModal = null;
    document.body.classList.remove("modal-open");
    if (returnFocus == null ? void 0 : returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-close]")) closeModal();
    else if (event.target === $("#reviewModal") || event.target === $("#imageModal")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    var _a, _b, _c;
    if (activeModal) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
      if (event.key === "Tab") {
        const focusable = [...$("#" + activeModal).querySelectorAll('button:not(:disabled),a[href],input,textarea,[tabindex="0"]')];
        if (event.shiftKey && document.activeElement === focusable[0]) {
          event.preventDefault();
          (_a = focusable.at(-1)) == null ? void 0 : _a.focus();
        } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
          event.preventDefault();
          (_b = focusable[0]) == null ? void 0 : _b.focus();
        }
      }
      return;
    }
    if (!session || $("#quiz").classList.contains("hidden") || ["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
    if (["1", "2", "3", "4"].includes(event.key)) {
      event.preventDefault();
      (_c = $("#answers").children[Number(event.key) - 1]) == null ? void 0 : _c.click();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      $("#prev").click();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      $("#next").click();
    }
  });
  var fallbackReviews = ["\u9898\u76EE\u90FD\u662F\u751F\u6D3B\u91CC\u4F1A\u9047\u5230\u7684\u573A\u666F\uFF0C\u505A\u8D77\u6765\u633A\u987A\u7684\u3002", "\u633A\u6709\u610F\u601D\u7684\uFF0C\u7ED9\u4E86\u6211\u4E00\u4E2A\u91CD\u65B0\u770B\u76F8\u5904\u65B9\u5F0F\u7684\u89D2\u5EA6\u3002", "\u559C\u6B22\u540E\u9762\u90A3\u4E9B\u5177\u4F53\u7684\u6C9F\u901A\u5EFA\u8BAE\uFF0C\u51C6\u5907\u7559\u7740\u6162\u6162\u770B\u3002", "\u6BD4\u53EA\u7ED9\u4E00\u4E2A\u6807\u7B7E\u66F4\u6709\u5185\u5BB9\uFF0C\u8FD8\u80FD\u4FDD\u5B58\u62A5\u544A\u3002"];
  function nextReview() {
    var _a;
    const values = (_a = session == null ? void 0 : session.content) == null ? void 0 : _a.reviewSamples;
    const samples = Array.isArray(values) && values.length ? values : fallbackReviews;
    let index = Math.floor(Math.random() * samples.length);
    if (samples.length > 1 && index === lastReviewIndex) index = (index + 1) % samples.length;
    lastReviewIndex = index;
    $("#reviewSample").textContent = String(samples[index]);
  }
  $("#reviewGift").addEventListener("click", () => {
    nextReview();
    openModal("reviewModal");
  });
  $("#newReview").addEventListener("click", nextReview);
  $("#copyReview").addEventListener("click", () => copyText($("#reviewSample").textContent, "\u8FD9\u6761\u53C2\u8003\u5DF2\u590D\u5236\uFF0C\u8BF7\u6309\u771F\u5B9E\u4F53\u9A8C\u4F7F\u7528"));
  async function exportReport(kind) {
    if (!report || exporting) return;
    exporting = true;
    const button = $(kind === "share" ? "#share" : "#saveResult"), original = button.textContent;
    button.disabled = true;
    button.textContent = "\u6B63\u5728\u751F\u6210\u56FE\u7247\u2026";
    try {
      imageFile = await (kind === "share" ? createShareImage(report) : createReportImage(report));
      $("#exportImage").src = imageFile.dataUrl;
      $("#exportImage").alt = kind === "share" ? report.result.name + " \xB7 \u5206\u4EAB\u5361" : report.result.name + " \xB7 \u5B8C\u6574\u5173\u7CFB\u89C2\u5BDF\u62A5\u544A";
      $("#imageTitle").textContent = kind === "share" ? "\u5206\u4EAB\u5361 \xB7 \u957F\u6309\u56FE\u7247\u4FDD\u5B58" : "\u5B8C\u6574\u7ED3\u679C\u957F\u56FE \xB7 \u957F\u6309\u56FE\u7247\u4FDD\u5B58";
      $("#imageModal .image-scroll").scrollTop = 0;
      openModal("imageModal");
    } catch (error) {
      toast(error.message || "\u751F\u6210\u56FE\u7247\u5931\u8D25\uFF0C\u8BF7\u518D\u8BD5\u4E00\u6B21\u3002");
    } finally {
      exporting = false;
      button.disabled = false;
      button.textContent = original;
    }
  }
  $("#share").addEventListener("click", () => exportReport("share"));
  $("#saveResult").addEventListener("click", () => exportReport("full"));
  $("#downloadImage").addEventListener("click", () => {
    if (!imageFile) return;
    const bytes = Uint8Array.from(atob(imageFile.dataUrl.split(",")[1]), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: imageFile.type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = imageFile.fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 6e4);
  });
  $("#gateArt").innerHTML = artMarkup("R1");
  $("#lastResult").classList.toggle("hidden", !getLastReport());
  if (localPreview) {
    $("#previewNotice").classList.remove("hidden");
    $("#previewNotice").textContent = "\u672C\u673A\u9A8C\u6536\u9884\u89C8 \xB7 \u5BC6\u7801\uFF1A" + (config.previewCode || "\u7531\u672C\u5730\u9884\u89C8\u670D\u52A1\u63D0\u4F9B") + " \xB7 \u4E0D\u8FDE\u63A5\u6B63\u5F0F\u5BC6\u7801\u6570\u636E\u5E93";
  }
  try {
    const saved = readStorage(sessionStorage, SESSION_KEY);
    if ((saved == null ? void 0 : saved.version) === CONTENT_VERSION) {
      validateContent(saved.content);
      if (!Number.isInteger(saved.index) || saved.index < 0 || saved.index > 11 || !saved.answers || !saved.presentation) throw new Error("invalid local progress");
      session = saved;
      if (session.completed) {
        renderReport(buildReport(session.content, session.answers));
        showView("result");
      } else {
        showView("quiz");
        renderQuestion();
      }
    }
  } catch (e) {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e2) {
    }
    session = null;
  }
})();
