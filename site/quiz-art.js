const colors = {
  R1: ['#e9def4', '#b49ace', '#71558e', '#edc8b5'],
  R2: ['#e2ece5', '#abc3b5', '#557565', '#e7c9af'],
  R3: ['#f4e1e4', '#d6a4b0', '#9b6477', '#dfcfb0'],
  R4: ['#e2e8f2', '#afbbd5', '#687b9e', '#e2c6a3'],
  R5: ['#dceae9', '#a0c4c0', '#527f83', '#ded0ae'],
  R6: ['#f1e7d8', '#cdb694', '#96805e', '#bfceb7'],
};

export function artMarkup(id = 'R1') {
  const [pale, mid, ink, warm] = colors[id] || colors.R1;
  const shapes = {
    R1: `<ellipse cx="240" cy="231" rx="148" ry="12" fill="${pale}"/><path d="M108 205V135a77 77 0 0 1 154 0v70" fill="${mid}"/><path d="M217 204V143a63 63 0 0 1 126 0v61" fill="${warm}"/><path d="M134 191q104 50 211-9" fill="none" stroke="${ink}" stroke-width="3"/><path d="M176 144q27 33 54 0" fill="none" stroke="#fffaf5" stroke-width="3"/><circle cx="302" cy="84" r="18" fill="${pale}"/>`,
    R2: `<path d="M119 229V121a100 100 0 0 1 200 0v108" fill="${pale}"/><path d="M158 229V129a62 62 0 0 1 124 0v100" fill="${mid}"/><path d="M190 229V140a31 31 0 0 1 62 0v89" fill="#fffdf9"/><path d="M305 227q45-48 25-111M319 190q-47-8-28-36M329 169q39-27 35-45" fill="none" stroke="${ink}" stroke-width="2.5"/><ellipse cx="359" cy="98" rx="16" ry="24" transform="rotate(28 359 98)" fill="${warm}"/>`,
    R3: `<circle cx="240" cy="144" r="87" fill="${pale}"/><path d="M240 58l17 18 26-1 9 25 23 12-4 25 12 23-18 19-3 26-25 6-17 20-24-8-24 8-17-20-25-6-3-26-18-19 12-23-4-25 23-12 9-25 26 1Z" fill="none" stroke="${ink}" stroke-width="2"/><path d="M220 180v-59a20 20 0 0 1 40 0v59" fill="${mid}"/><circle cx="240" cy="136" r="6" fill="#fffdf9"/><path d="M240 143v17" stroke="#fffdf9" stroke-width="3"/><path d="M124 219h233" stroke="${warm}" stroke-width="3"/>`,
    R4: `<path d="M128 225l64-135 51 135M237 225l64-135 51 135" fill="${pale}"/><path d="M154 225l38-80 31 80M261 225l40-80 28 80" fill="${mid}"/><path d="M192 90l54-34 55 34" fill="none" stroke="${ink}" stroke-width="2"/><circle cx="192" cy="90" r="7" fill="${ink}"/><circle cx="301" cy="90" r="7" fill="${ink}"/><circle cx="246" cy="56" r="9" fill="${warm}"/><path d="M116 236h246" stroke="${ink}" stroke-width="2"/>`,
    R5: `<circle cx="240" cy="121" r="76" fill="${pale}"/><path d="M98 198q36-20 72 0t72 0t72 0t72 0M98 222q36-20 72 0t72 0t72 0t72 0" fill="none" stroke="${mid}" stroke-width="3"/><path d="M240 87v110m-49-48q0 50 49 50t49-50m-49 49-15-17m15 17 15-17" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><circle cx="240" cy="78" r="12" fill="none" stroke="${ink}" stroke-width="4"/><circle cx="339" cy="75" r="17" fill="${warm}"/>`,
    R6: `<circle cx="309" cy="78" r="29" fill="${warm}"/><path d="M84 226l109-122 62 69 51-43 91 96Z" fill="${pale}"/><path d="M169 226l91-119 130 119Z" fill="${mid}"/><path d="M236 226q72-39 15-62q-45-19 9-57" fill="none" stroke="#fffdf9" stroke-width="7"/><path d="M84 237h313M113 103q14-12 27 0m2-18q13-10 25 0" fill="none" stroke="${ink}" stroke-width="2"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 280" width="480" height="280" role="img" aria-label="抽象关系插画"><path d="M75 239h331" stroke="${pale}" stroke-width="1"/>${shapes[id] || shapes.R1}<path d="M88 61v18m-9-9h18m276 75v12m-6-6h12" stroke="${ink}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/></svg>`;
}
