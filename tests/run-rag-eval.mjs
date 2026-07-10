import fs from 'node:fs';

const datasetPath = process.env.RAG_EVAL_DATASET || './rag-eval.json';
const dataset = JSON.parse(fs.readFileSync(new URL(datasetPath, import.meta.url), 'utf8'));
const endpoint = process.env.RAG_EVAL_ENDPOINT || 'https://58884a87.zhongcheng-law-firm.pages.dev/api/chat';
const deployment = process.env.RAG_EVAL_DEPLOYMENT || '58884a87-fbdc-41ff-8721-c4f819f55255';
const embeddingModel = '@cf/qwen/qwen3-embedding-0.6b';
const vectorizeIndex = process.env.RAG_EVAL_INDEX || 'labor-law-qwen3-index';
const reportName = process.env.RAG_EVAL_REPORT || 'rag-eval-2026-07-10';
const reportTitle = process.env.RAG_EVAL_TITLE || '中文劳动法 RAG 评测完整报告';
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ email: 'eval@zhongchenglaw.com', sub: 'rag-eval' })}.x`;
const missingCoveragePatterns = ['当前法条库未收录', '未收录', '当前法条库没有', '当前参考法条未覆盖', '未明确规定', '没有统一', '未包含', '未规定', '未明确', '无法根据当前法条库'];

async function runCase(item) {
  const startedAt = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-RAG-Eval': '1'
      },
      body: JSON.stringify({ message: item.question })
    });
    const text = await response.text();
    const expectedArticlesFound = item.expectedArticles.filter((article) => text.includes(article));
    const retrievalRoute = response.headers.get('X-RAG-Route') || '';
    const retrievalArticles = (response.headers.get('X-RAG-Recall') || '')
      .split(',')
      .map((article) => {
        try {
          return decodeURIComponent(article.trim());
        } catch {
          return article.trim();
        }
      })
      .filter(Boolean);
    const retrievalLayerArticlesFound = item.expectedArticles.filter((article) =>
      retrievalArticles.some((retrieved) => retrieved.endsWith(`:${article}`))
    );
    const retrievalLayerPass = item.type === 'retrieval'
      ? retrievalLayerArticlesFound.length > 0
      : true;
    const missingCoverageDisclosed = missingCoveragePatterns.some((pattern) => text.includes(pattern));
    const contentPass = item.type === 'retrieval'
      ? expectedArticlesFound.length > 0
      : item.expectedArticles.every((article) => text.includes(article)) && missingCoverageDisclosed;
    return {
      ...item,
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      response: text,
      expectedArticlesFound,
      retrievalRoute,
      retrievalArticles,
      retrievalLayerArticlesFound,
      retrievalLayerPass,
      missingCoverageDisclosed,
      pass: response.ok && contentPass,
      evaluationNote: contentPass
        ? (item.type === 'retrieval' ? '至少命中一个预期法条编号。' : '已披露当前语料覆盖边界。')
        : (item.type === 'retrieval' ? '未命中预期法条编号。' : '未充分披露当前语料覆盖边界。')
    };
  } catch (error) {
    return {
      ...item,
      httpStatus: 0,
      latencyMs: Date.now() - startedAt,
      response: '',
      expectedArticlesFound: [],
      missingCoverageDisclosed: false,
      pass: false,
      evaluationNote: `请求失败：${error.message}`
    };
  }
}

const results = [];
for (let i = 0; i < dataset.cases.length; i += 5) {
  results.push(...await Promise.all(dataset.cases.slice(i, i + 5).map(runCase)));
}

const retrieval = results.filter((item) => item.type === 'retrieval');
const guardrails = results.filter((item) => item.type === 'coverage_guardrail');
const passed = results.filter((item) => item.pass);
const generatedAt = new Date().toISOString();
const totals = {
  cases: results.length,
  passed: passed.length,
  failed: results.length - passed.length,
  passRate: Number((passed.length / results.length).toFixed(4)),
  retrievalCases: retrieval.length,
  retrievalPassed: retrieval.filter((item) => item.pass).length,
  guardrailCases: guardrails.length,
  guardrailPassed: guardrails.filter((item) => item.pass).length,
  retrievalLayerCases: retrieval.length,
  retrievalLayerPassed: retrieval.filter((item) => item.retrievalLayerPass).length,
  averageLatencyMs: Math.round(results.reduce((sum, item) => sum + item.latencyMs, 0) / results.length)
};
const report = {
  generatedAt,
  endpoint,
  deployment,
  dataset: dataset.dataset,
  datasetCorpusVersion: dataset.corpusVersion,
  embeddingModel,
  vectorizeIndex,
  totals,
  results
};

const articleList = (items) => items.length ? items.join('、') : '无';
const escapeCell = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const markdown = [
  `# ${reportTitle}`, '',
  `生成时间：${generatedAt}`,
  `评测部署：\`${deployment}\``,
  `评测接口：\`${endpoint}\``,
  `Embedding 模型：\`${embeddingModel}\``,
  `Vectorize 索引：\`${vectorizeIndex}\``, '',
  '## 技术摘要', '',
  `本次共运行 ${results.length} 道题，通过 ${passed.length} 道，失败 ${results.length - passed.length} 道，总通过率为 ${(passed.length / results.length * 100).toFixed(1)}%。召回题通过 ${totals.retrievalPassed}/${totals.retrievalCases}，语料边界题通过 ${totals.guardrailPassed}/${totals.guardrailCases}。`, '',
  `召回层原始命中：${totals.retrievalLayerPassed}/${totals.retrievalCases}。该指标直接检查 Vectorize 返回的法条元数据，不依赖生成模型是否自行知道答案。`, '',
  '自动通过标准：端到端召回题回答中出现至少一个预期法条编号；召回层评测直接检查 X-RAG-Recall；语料边界题出现预期法条（如有）并明确披露当前法条库未覆盖。以上指标不等同于完整法律意见正确率。', '',
  '## 总体结果', '',
  '| 指标 | 结果 |', '| --- | ---: |',
  `| 总题数 | ${totals.cases} |`, `| 通过 | ${totals.passed} |`, `| 失败 | ${totals.failed} |`, `| 总通过率 | ${(totals.passRate * 100).toFixed(1)}% |`,
  `| 法条召回题 | ${totals.retrievalPassed}/${totals.retrievalCases} |`, `| 原始召回层命中 | ${totals.retrievalLayerPassed}/${totals.retrievalCases} |`, `| 语料边界题 | ${totals.guardrailPassed}/${totals.guardrailCases} |`, `| 平均接口耗时 | ${totals.averageLatencyMs} ms |`, '',
  '## 逐题结果', '',
  '| ID | 类型 | 分类 | 预期法条 | 回答命中 | 原始召回 | 状态 |', '| --- | --- | --- | --- | --- | --- | --- |',
  ...results.map((item) => `| ${item.id} | ${item.type} | ${escapeCell(item.category)} | ${articleList(item.expectedArticles)} | ${articleList(item.expectedArticlesFound)} | ${item.retrievalLayerPass ? 'PASS' : 'FAIL'} | ${item.pass ? 'PASS' : 'FAIL'} |`), '',
  '## 详细回答', '',
  ...results.flatMap((item) => [
    `### ${item.id} · ${item.category} · ${item.pass ? 'PASS' : 'FAIL'}`, '',
    `问题：${item.question}`, '',
    `预期法条：${articleList(item.expectedArticles)}；回答命中：${articleList(item.expectedArticlesFound)}；原始召回：${articleList(item.retrievalArticles)}；路由：${item.retrievalRoute || '未知'}；边界披露：${item.missingCoverageDisclosed ? '是' : '否'}；HTTP：${item.httpStatus}；耗时：${item.latencyMs} ms。`, '',
    item.response.trim() || '无响应内容。', ''
  ]),
  '## 方法与限制', '',
  '- 本次评测调用 Cloudflare Pages 生产部署，不是本地模拟环境。',
  '- 召回题的自动指标只判断预期法条编号是否出现在最终回答中，不能替代人工审查条文原文、法律适用和行动建议。',
  '- 语料边界题用于检查模型是否承认当前语料范围，不代表相关法律问题在现实法律体系中没有答案。',
  '- 本次测试未改动评测集、向量库或生产代码。', ''
].join('\n');

fs.mkdirSync(new URL('./reports/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL(`./reports/${reportName}.json`, import.meta.url), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(new URL(`./reports/${reportName}.md`, import.meta.url), markdown);
console.log(JSON.stringify(totals));
console.log(results.map((item) => `${item.id} ${item.pass ? 'PASS' : 'FAIL'} ${item.evaluationNote}`).join('\n'));
