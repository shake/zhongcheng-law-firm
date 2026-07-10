import assert from 'node:assert/strict';
import {
  mergeVectorMatches,
  rerankVectorMatches,
  routeCorpusNames
} from '../functions/_shared/retrieval.js';

assert.deepEqual(routeCorpusNames('劳动合同解除后如何申请仲裁'), ['labor']);
assert.deepEqual(routeCorpusNames('保险合同免责条款是否有效'), ['insurance']);
assert.deepEqual(routeCorpusNames('劳动关系中的雇主责任险如何处理'), ['labor', 'insurance']);
assert.deepEqual(routeCorpusNames('第十六条规定了什么？'), ['labor', 'insurance']);

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

console.log('retrieval-unit.test.mjs: all assertions passed');
