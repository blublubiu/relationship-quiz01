// Merchant supplied editorial headings. Keep this wording verbatim.
const headings = {
  R1: ['温柔的降维打击者', '焦虑型+钝感包容', '你作闹时，ta像看小孩一样看着你。'],
  R2: ['清醒的破壁人', '回避型+高边界尊重', '不哄你，但用极度的尊重撬开你的防御。'],
  R3: ['带刺的守门员', '讨好型+底线重塑', '看似冷酷，却是唯一敢替你挡下委屈的人。'],
  R4: ['高配得感的同谋', '安全/独立型+智性成长', '不谈风月废话，只跟你谈认知和搞钱。'],
  R5: ['透明的锚点', '恐惧型+情绪容器', '能看穿你每一次说“滚”的背后都在喊“抱紧我”。'],
  R6: ['旷野的引路人', '迷失/恋爱脑+自我唤醒', '绝不把你当附属品，硬生生拽你去看世界。'],
};
export function applyPartnerHeading(result) {
  const heading = headings[result.id];
  return heading ? { ...result, name: heading[0], profileLabel: heading[1], quote: heading[2] } : result;
}
