const INSURANCE_SIGNAL = /保险法|保险活动|保险业务|保险合同|保险人|投保人|被保险人|受益人|保险金|保单|理赔|保险费|保费|保险公司|保险代理|保险经纪|保险利益|如实告知|保险事故|保险责任|免责条款|人身保险|财产保险|寿险|再保险|雇主责任险/;
const LABOR_SIGNAL = /劳动|工资|加班|辞退|解除|仲裁|劳动合同|社会保险|社保|工伤|用人单位|劳动者|试用期|年假|产假|调岗|降薪|裁员|竞业/;

export function routeCorpusNames(message) {
  const hasInsuranceSignal = INSURANCE_SIGNAL.test(message);
  const hasLaborSignal = LABOR_SIGNAL.test(message);

  if (hasInsuranceSignal && hasLaborSignal) return ['labor', 'insurance'];
  if (hasInsuranceSignal) return ['insurance'];
  if (hasLaborSignal) return ['labor'];

  // An unspecified legal domain must not silently default to labor law.
  return ['labor', 'insurance'];
}

export function mergeVectorMatches(matches) {
  const seen = new Set();
  const merged = [];

  for (const match of matches) {
    const key = match.id || `${match.metadata?.source || ''}:${match.metadata?.chapter || ''}:${match.metadata?.article || ''}:${match.metadata?.text || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(match);
  }

  return merged;
}

export function rerankVectorMatches(matches, hints, message, limit = 8) {
  const keywords = extractLegalKeywords(message);

  return mergeVectorMatches(matches)
    .map((match) => {
      const text = match.metadata?.text || '';
      const chapter = match.metadata?.chapter || '';
      const article = match.metadata?.article || '';
      let rank = match.score || 0;

      if (hints.article && article === hints.article) rank += 2;
      if (hints.chapter && chapter === hints.chapter) rank += 1;

      for (const keyword of keywords) {
        if (text.includes(keyword)) rank += 0.08;
      }

      rank += Math.max(0, 0.12 - Math.min(text.length, 240) / 2000);

      return { match, rank };
    })
    .sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;

      const aText = a.match.metadata?.text || '';
      const bText = b.match.metadata?.text || '';
      return aText.length - bText.length;
    })
    .slice(0, limit)
    .map((item) => item.match);
}

function extractLegalKeywords(message) {
  const words = [
    '试用期', '工资', '加班', '辞退', '解除', '仲裁', '补偿', '赔偿', '社保',
    '合同', '年假', '病假', '产假', '调岗', '降薪', '旷工', '裁员', '竞业',
    '工伤', '经济补偿', '违法解除', '未签劳动合同', '拖欠工资', '保险合同',
    '投保人', '被保险人', '受益人', '保险金', '理赔', '保险费', '保费',
    '保险公司', '保险代理', '保险经纪', '保险利益', '如实告知', '保险事故',
    '保险责任', '免责条款'
  ];

  return words.filter((word) => message.includes(word));
}
