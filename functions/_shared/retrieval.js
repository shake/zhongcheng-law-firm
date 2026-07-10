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

export function getArticleFallbackHints(corpusKey, message) {
  const hints = [];
  const add = (...articles) => hints.push(...articles);

  if (corpusKey === 'labor') {
    if (/工会/.test(message)) add('第七条');
    if (/劳动者.{0,8}(权利|权益)|劳动权益/.test(message)) add('第三条');
    if (/劳动合同.{0,12}(形式|书面|内容)|书面.{0,8}劳动合同/.test(message)) add('第十六条', '第十九条');
    if (/劳动安全|安全卫生/.test(message)) add('第五十二条');
    if (/社会保险|社保/.test(message)) add('第七十二条', '第七十三条');
    if (/劳动争议|劳动仲裁|调解、仲裁|仲裁、提起诉讼/.test(message)) add('第七十七条');
    if (/加班|延长工作时间/.test(message)) add('第四十一条');
    if (/拖欠工资|克扣.*工资|工资.*拖欠/.test(message)) add('第九十一条');
    if (/孕期|怀孕|女职工/.test(message)) add('第六十一条');
    if (/违反劳动法|违法解除|劳动法.*责任/.test(message)) add('第九十八条');
  } else {
    if (/责任保险/.test(message)) add('第六十五条', '第六十六条');
    if (/保险事故.*通知|通知.*保险事故/.test(message)) add('第二十一条');
    if (/理赔核定|赔偿.*核定|核定.*保险/.test(message)) add('第二十三条');
    if (/保险合同.*(两种|解释)|条款.*解释/.test(message)) add('第三十条');
    if (/保险合同.*成立|合同.*成立/.test(message)) add('第十三条');
    if (/免责条款|提示和说明|明确说明/.test(message)) add('第十七条');
    if (/保险金.*材料|提供.*材料|理赔材料/.test(message)) add('第二十二条');
    if (/人身保险利益|保险利益/.test(message)) add('第三十一条');
    if (/代位/.test(message)) add('第六十条');
    if (/保险合同.*定义|保险法所称.*保险/.test(message)) add('第二条', '第十条');
  }

  return [...new Set(hints)];
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

      if (match.metadata?.retrievalAnchor) rank += 3;
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

export function selectBalancedCorpusMatches(corpusResults, hints, message, totalLimit = 10) {
  const rankedCorpora = corpusResults.map((corpus) => ({
    ...corpus,
    matches: rerankVectorMatches(corpus.matches, hints, message, 30)
  }));

  if (rankedCorpora.length <= 1) {
    return rerankVectorMatches(
      takeDiverseMatches(rankedCorpora[0]?.matches || [], totalLimit),
      hints,
      message,
      totalLimit
    );
  }

  const selected = [];
  const selectedIds = new Set();
  const articleCounts = new Map();
  const minimumPerCorpus = Math.min(5, Math.floor(totalLimit / rankedCorpora.length));

  for (const corpus of rankedCorpora) {
    for (const match of takeDiverseMatches(corpus.matches, minimumPerCorpus)) {
      addMatch(match, selected, selectedIds, articleCounts);
    }
  }

  const remaining = rankedCorpora.flatMap((corpus) => corpus.matches)
    .filter((match) => !selectedIds.has(match.id));
  const globallyRanked = rerankVectorMatches(remaining, hints, message, remaining.length);

  for (const match of globallyRanked) {
    if (selected.length >= totalLimit) break;
    addMatch(match, selected, selectedIds, articleCounts);
  }

  return rerankVectorMatches(selected, hints, message, totalLimit);
}

function takeDiverseMatches(matches, limit) {
  const articleCounts = new Map();
  const selected = [];
  const orderedMatches = [...matches].sort((a, b) =>
    Number(Boolean(b.metadata?.retrievalAnchor)) - Number(Boolean(a.metadata?.retrievalAnchor))
  );

  for (const match of orderedMatches) {
    if (selected.length >= limit) break;
    const article = match.metadata?.article || match.id || '';
    const count = articleCounts.get(article) || 0;
    if (count >= 2) continue;
    articleCounts.set(article, count + 1);
    selected.push(match);
  }

  return selected;
}

function addMatch(match, selected, selectedIds, articleCounts) {
  const id = match.id || `${match.metadata?.source || ''}:${match.metadata?.article || ''}:${match.metadata?.text || ''}`;
  if (selectedIds.has(id)) return false;

  const article = `${match.metadata?.source || ''}:${match.metadata?.article || ''}`;
  const count = articleCounts.get(article) || 0;
  if (count >= 2) return false;

  selectedIds.add(id);
  articleCounts.set(article, count + 1);
  selected.push(match);
  return true;
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
