import assert from 'node:assert/strict';
import {
  mergeVectorMatches,
  getArticleFallbackHints,
  rerankVectorMatches,
  routeCorpusNames,
  selectBalancedCorpusMatches
} from '../functions/_shared/retrieval.js';

assert.deepEqual(routeCorpusNames('劳动合同解除后如何申请仲裁'), ['labor']);
assert.deepEqual(routeCorpusNames('保险合同免责条款是否有效'), ['insurance']);
assert.deepEqual(routeCorpusNames('劳动关系中的雇主责任险如何处理'), ['labor', 'insurance']);
assert.deepEqual(routeCorpusNames('第十六条规定了什么？'), ['labor', 'insurance']);
assert.deepEqual(getArticleFallbackHints('labor', '劳动者发生劳动争议并申请仲裁'), ['第七十七条']);
assert.deepEqual(getArticleFallbackHints('insurance', '责任保险中保险人能否直接赔偿第三者'), ['第六十五条', '第六十六条']);

const laborMatch = {
  id: 'labor-16',
  score: 0.55,
  metadata: { source: '中华人民共和国劳动法', article: '第十六条', text: '劳动合同是劳动者与用人单位之间建立劳动关系的协议。' }
};
const insuranceMatch = {
  id: 'insurance-16',
  score: 0.58,
  metadata: { source: '中华人民共和国保险法', article: '第十六条', text: '订立保险合同，保险人可以就投保人的告知事项进行询问。' }
};
const duplicate = { ...laborMatch, score: 0.2 };

assert.equal(mergeVectorMatches([laborMatch, duplicate, insuranceMatch]).length, 2);
const reranked = rerankVectorMatches(
  [laborMatch, insuranceMatch],
  { article: '第十六条' },
  '第十六条规定了什么？',
  1
);
assert.equal(reranked.length, 1);
assert.equal(reranked[0].metadata.article, '第十六条');

const balanced = selectBalancedCorpusMatches([
  {
    key: 'labor',
    matches: Array.from({ length: 8 }, (_, index) => ({
      id: `labor-${index}`,
      score: 0.9 - index / 100,
      metadata: { source: '中华人民共和国劳动法', article: index < 4 ? '第七十二条' : `第${index}条`, text: '劳动者 用人单位 社会保险' }
    }))
  },
  {
    key: 'insurance',
    matches: Array.from({ length: 8 }, (_, index) => ({
      id: `insurance-${index}`,
      score: 0.99 - index / 100,
      metadata: { source: '中华人民共和国保险法', article: index < 4 ? '第六十五条' : `第${index}条`, text: '保险人 保险责任 保险合同' }
    }))
  }
], {}, '劳动者发生事故涉及保险责任', 10);
assert.equal(balanced.length, 10);
assert.ok(balanced.filter((match) => match.metadata.source === '中华人民共和国劳动法').length >= 4);
assert.ok(balanced.filter((match) => match.metadata.source === '中华人民共和国保险法').length >= 4);
assert.ok(balanced.filter((match) => match.metadata.article === '第七十二条').length <= 2);
assert.ok(balanced.filter((match) => match.metadata.article === '第六十五条').length <= 2);

console.log('retrieval-unit.test.mjs: all assertions passed');
