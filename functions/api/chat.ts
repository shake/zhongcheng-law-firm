import {
  CORPUS_SOURCE,
  CORPUS_VERSION,
  EMBEDDING_MODEL,
  INSURANCE_CORPUS_SOURCE,
  INSURANCE_CORPUS_VERSION,
  QUERY_INSTRUCTION
} from '../_shared/rag';
import {
  getArticleFallbackHints,
  mergeVectorMatches,
  routeCorpusNames,
  selectBalancedCorpusMatches
} from '../_shared/retrieval.js';

interface Env {
  VECTORIZE: any;
  INSURANCE_VECTORIZE: any;
  AI: any;
  GEMINI_API_KEY: string;
  CLERK_SECRET_KEY?: string;
  DB?: any; // Cloudflare D1 Database binding
}

const CHINESE_NUMERAL_PATTERN = '[一二三四五六七八九十百零〇]+|\\d+';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({
      success: false,
      error: "Missing GEMINI_API_KEY in Cloudflare environment variables."
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { message } = await request.json() as { message: string };
    if (!message) {
      return new Response('Missing message', { status: 400 });
    }

    // Auth Bearer Check
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized: Missing or invalid token', { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    if (env.CLERK_SECRET_KEY) {
      const isValid = await verifyClerkToken(token, env.CLERK_SECRET_KEY);
      if (!isValid) {
        return new Response('Unauthorized: Invalid Clerk session', { status: 401 });
      }
    }

    // Decode user email from JWT token payload to bind subsequent questions
    let userEmail = 'anonymous@zhongchenglaw.com';
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payloadDecoded = decodeBase64Url(parts[1]);
        const payload = JSON.parse(payloadDecoded);
        if (payload.email) {
          userEmail = payload.email;
        } else if (payload.sub) {
          userEmail = `clerk_user_id_${payload.sub}`;
        }
      }
    } catch (e) {
      console.error('Failed to parse token payload:', e);
    }

    // Output server audit log: Binding user email with the question asked
    console.log(`[CONSULTATION LOG] User Email: ${userEmail} | Question: ${message}`);

    // 1. Route first so each corpus gets a domain-specific query vector.
    const searchHints = extractLawSearchHints(message);
    const corpusConfigs = getCorpusConfigs(env, message);
    const isCrossCorpus = corpusConfigs.length > 1;
    const queryTexts = corpusConfigs.flatMap((corpus) => {
      const baseQuery = `Instruct: ${QUERY_INSTRUCTION}\nQuery: ${message}`;
      return isCrossCorpus ? [baseQuery, buildCorpusQuery(corpus, message)] : [baseQuery];
    });
    const embeddingResponse = await env.AI.run(EMBEDDING_MODEL, {
      text: queryTexts
    });

    if (!embeddingResponse?.data || embeddingResponse.data.length < queryTexts.length) {
      throw new Error('Failed to generate embedding for the question.');
    }

    const corpusResults = await Promise.all(
      corpusConfigs.map((corpus, index) => {
        const vectors = isCrossCorpus
          ? [embeddingResponse.data[index * 2], embeddingResponse.data[index * 2 + 1]]
          : [embeddingResponse.data[index]];
        return queryCorpusVectors(corpus, vectors, searchHints, message);
      })
    );
    const vectorizeResults = selectBalancedCorpusMatches(
      corpusResults.map((matches, index) => ({ key: corpusConfigs[index].key, matches })),
      searchHints,
      message,
      10
    );

    // 3. Construct Context
    let lawContext = '';
    if (vectorizeResults.length > 0) {
      lawContext = corpusConfigs.map((corpus) => {
        const corpusMatches = vectorizeResults.filter((match: VectorizeMatch) =>
          match.metadata?.source === corpus.source
        );
        if (corpusMatches.length === 0) return '';
        const section = corpusMatches.map((match: VectorizeMatch, idx: number) => {
          const text = match.metadata?.text || '';
          const score = Math.round((match.score || 0) * 100);
          const anchor = match.metadata?.retrievalAnchor ? ' · 关键匹配' : '';
          const chapter = match.metadata?.chapter ? ` · ${match.metadata.chapter}` : '';
          const article = match.metadata?.article ? ` ${match.metadata.article}` : '';
          return `【参考法条 ${idx + 1}${anchor}${chapter}${article} (相关度: ${score}%)】\n${text}`;
        }).join('\n\n');
        return `【${corpus.source}参考法律条款】\n${section}`;
      }).filter(Boolean).join('\n\n');
    } else {
      lawContext = '未在当前检索范围内检索到直接相关的法律条文。';
    }

    // 4. Construct Consolidated Prompt
    const corpusNames = [...new Set(corpusConfigs.map((corpus) => corpus.source))].join('、');
    const promptText = `你是一位专业、严谨、温和且高效的中国法律顾问。请结合下面提供的法律条例上下文，用最精炼、无冗余的语言解答用户的具体提问，避免任何语义重复。

你的回答应当满足以下严密的结构要求：
1. 【初步评估】：用2-3句话直接给出核心法律评估与定性结论（相关主体是否违法，用户的法定权利是什么）。此处只需简要陈述结论，切勿在此处引用法条原文或展开解释，以防与后续内容重复。
2. 【法条引述】：列出支持你结论的法律条款。仅列出条文序号与条文的核心原文，不要在这里加解释性描述。
3. 【行动指引】：为劳动者提供3-4条最核心、可操作的维权步骤（例如：书面通知、保留关键证据、申请仲裁等），每条建议要简短有力，避免废话。
4. 【专业免责】：在回答的最后，附加一句话的专业免责声明。

重要约束：本次检索来源为 ${corpusNames}。${corpusConfigs.length > 1 ? '请分别从每部法律的参考条款中提取依据，明确区分劳动法分析和保险法分析，不得只回答其中一部法律。凡标记为“关键匹配”的参考法条，必须在【法条引述】中逐一覆盖，不得因内容相近而省略。' : ''}只能把下面检索到的参考法条作为法律依据，不能把《劳动法》和《保险法》的条文互相替代。参考法条没有出现的法律规则、法条编号、金额、期限、比例或赔偿标准，不得自行补充或猜测。如果参考条文只规定一般原则、没有规定用户询问的具体标准，也必须明确说明“当前法条未规定该具体标准”。如果问题涉及当前法条库未收录的法律，应明确说明“当前法条库未收录该法律依据”，不要用其他法律替代回答。

请始终使用中文进行回答，格式使用 Markdown 排版。

下面是为您检索到的【参考法律条款】：
${lawContext}

用户提问的问题是：
"${message}"`;

    // 5. Tool calling declarations & checking
    const toolsDeclaration = [
      {
        functionDeclarations: [
          {
            name: "calculateSeverance",
            description: "计算因劳动合同解除或被违法开除时的法定经济补偿金及违法解除赔偿金",
            parameters: {
              type: "OBJECT",
              properties: {
                monthlySalary: {
                  type: "NUMBER",
                  description: "劳动者前12个月的平均应发工资（人民币元）"
                },
                monthsOfService: {
                  type: "NUMBER",
                  description: "劳动者在该用人单位的工作年限折算月数（例如工作1年3个月填15，不满6个月填5）"
                },
                isIllegalDismissal: {
                  type: "BOOLEAN",
                  description: "是否为用人单位违法解除/违法开除（违法解除为双倍经济补偿）"
                },
                localAverageSalary: {
                  type: "NUMBER",
                  description: "当地职工月平均工资（可选，用于计算三倍高薪封顶，默认为贵阳市标准约8000元）"
                }
              },
              required: ["monthlySalary", "monthsOfService"]
            }
          }
        ]
      }
    ];

    // Call generateContent first (non-streaming) to check if Gemini wants to invoke a tool
    const checkUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`;
    const checkResponse = await fetch(checkUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: promptText }] }
        ],
        tools: toolsDeclaration,
        generationConfig: {
          temperature: 0.1
        }
      })
    });

    if (!checkResponse.ok) {
      const checkErrText = await checkResponse.text();
      throw new Error(`Gemini Check API returned status ${checkResponse.status}: ${checkErrText}`);
    }

    const checkData = await checkResponse.json() as any;
    const firstCandidate = checkData.candidates?.[0];
    const firstPart = firstCandidate?.content?.parts?.[0];

    let geminiResponse;

    if (firstPart && firstPart.functionCall) {
      const functionCall = firstPart.functionCall;
      const { name, args } = functionCall;
      
      // Execute the tool locally
      const toolResult = executeTool(name, args);

      // Call streaming API passing the tool response
      const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?key=${env.GEMINI_API_KEY}`;
      geminiResponse = await fetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: promptText }]
            },
            {
              role: 'model',
              parts: [{ functionCall }]
            },
            {
              role: 'function',
              parts: [{
                functionResponse: {
                  name: name,
                  response: { output: toolResult }
                }
              }]
            }
          ],
          tools: toolsDeclaration,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048
          }
        })
      });
    } else {
      // No tool called, call streaming API normally
      const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?key=${env.GEMINI_API_KEY}`;
      geminiResponse = await fetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: promptText }] }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048
          }
        })
      });
    }

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API returned status ${geminiResponse.status}: ${errText}`);
    }

    // 6. Streaming Transform Stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = geminiResponse.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    (async () => {
      let buffer = '';
      let fullResponseText = '';
      try {
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const textTokens = extractTextFromGeminiChunk(buffer);
          if (textTokens) {
            fullResponseText += textTokens;
            await writer.write(encoder.encode(textTokens));
            buffer = ''; 
          }
        }

        // Write the completed conversation to Cloudflare D1
        if (env.DB) {
          try {
            await env.DB.prepare(
              "INSERT INTO consultation_logs (email, question, response) VALUES (?, ?, ?)"
            ).bind(userEmail, message, fullResponseText).run();
            console.log(`[D1 LOG SUCCESS] Written consultation log for ${userEmail}`);
          } catch (d1Err) {
            console.error("Failed to write log to Cloudflare D1 database:", d1Err);
          }
        }
      } catch (err: any) {
        await writer.write(encoder.encode(`\n[流传输错误: ${err.message}]`));
      } finally {
        await writer.close();
      }
    })();

    const headers: Record<string, string> = {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    };
    if (request.headers.get('X-RAG-Eval') === '1') {
      headers['X-RAG-Route'] = corpusConfigs.map((corpus) => corpus.key).join(',');
      headers['X-RAG-Recall'] = vectorizeResults
        .map((match: VectorizeMatch) => encodeURIComponent(`${match.metadata?.source || 'unknown'}:${match.metadata?.article || 'unknown'}`))
        .join(',');
    }

    return new Response(readable, { headers });

  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message || error
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

function extractTextFromGeminiChunk(buffer: string): string {
  const matches = buffer.match(/"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g);
  if (!matches) return '';
  
  let result = '';
  for (const match of matches) {
    const valMatch = match.match(/"text"\s*:\s*"(.*)"/);
    if (valMatch && valMatch[1]) {
      try {
        const parsed = JSON.parse(`"${valMatch[1]}"`);
        result += parsed;
      } catch (e) {
        result += valMatch[1];
      }
    }
  }
  return result;
}

type VectorizeMatch = {
  id?: string;
  score?: number;
  metadata?: {
    text?: string;
    chapter?: string;
    article?: string;
    corpusVersion?: string;
    source?: string;
    retrievalAnchor?: boolean;
  };
};

type LawSearchHints = {
  chapter?: string;
  article?: string;
};

type CorpusConfig = {
  key: 'labor' | 'insurance';
  index: any;
  source: string;
  version: string;
};

function getCorpusConfigs(env: Env, message: string): CorpusConfig[] {
  const corpora: Record<'labor' | 'insurance', CorpusConfig> = {
    labor: { key: 'labor', index: env.VECTORIZE, source: CORPUS_SOURCE, version: CORPUS_VERSION },
    insurance: { key: 'insurance', index: env.INSURANCE_VECTORIZE, source: INSURANCE_CORPUS_SOURCE, version: INSURANCE_CORPUS_VERSION }
  };

  return routeCorpusNames(message).map((key) => corpora[key]);
}

function buildCorpusQuery(corpus: CorpusConfig, message: string) {
  const focus = corpus.key === 'labor'
    ? '劳动者、用人单位、劳动合同、工资、加班、劳动安全卫生、社会保险、劳动争议和劳动者权益；忽略保险合同、保险人和保险理赔部分。'
    : '保险合同、投保人、被保险人、保险人、保险责任、保险事故、保险金、理赔、责任保险和保险条款；忽略劳动合同、工资和劳动争议部分。';
  return `Instruct: ${QUERY_INSTRUCTION}\n仅从《${corpus.source}》角度检索。优先关注：${focus}\nQuery: ${message}`;
}

async function queryCorpusVectors(corpus: CorpusConfig, questionVectors: number[][], hints: LawSearchHints, message: string) {
  const queries: Array<{
    filter?: Record<string, string>;
    topK: number;
  }> = [];

  const articleHints = hints.article
    ? [hints.article]
    : getArticleFallbackHints(corpus.key, message);

  for (const article of articleHints) {
    queries.push({ filter: { article, corpusVersion: corpus.version }, topK: 30 });
  }
  if (articleHints.length === 0 && hints.chapter) {
    queries.push({ filter: { chapter: hints.chapter, corpusVersion: corpus.version }, topK: 30 });
  }

  queries.push({ filter: { corpusVersion: corpus.version }, topK: 30 });

  const results = await Promise.all(
    questionVectors.flatMap((questionVector) => queries.map(async (query) => ({
      query,
      result: await corpus.index.query(questionVector, {
        topK: query.topK,
        filter: query.filter,
        returnMetadata: 'all',
        returnValues: false
      })
    })))
  );

  // Keep the per-corpus candidate pool intact; global reranking happens after both indexes return.
  return mergeVectorMatches(results.flatMap(({ query, result }) =>
    (result?.matches || []).map((match: VectorizeMatch) => query.filter?.article
      ? {
        ...match,
        metadata: { ...match.metadata, retrievalAnchor: true }
      }
      : match)
  ));
}

function extractLawSearchHints(message: string): LawSearchHints {
  const normalized = message.replace(/\s+/g, '');
  const articleMatch = normalized.match(new RegExp(`第(?:${CHINESE_NUMERAL_PATTERN})条`));
  const chapterMatch = normalized.match(new RegExp(`第(?:${CHINESE_NUMERAL_PATTERN})章`));

  return {
    article: articleMatch ? articleMatch[0] : undefined,
    chapter: chapterMatch ? chapterMatch[0] : undefined
  };
}

async function verifyClerkToken(token: string, clerkSecretKey: string): Promise<boolean> {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function decodeBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

function executeTool(name: string, args: any): any {
  if (name === 'calculateSeverance') {
    const monthlySalary = Number(args.monthlySalary);
    const monthsOfService = Number(args.monthsOfService);
    const isIllegalDismissal = !!args.isIllegalDismissal;
    const localAverageSalary = Number(args.localAverageSalary || 8000); 

    // 1. 计算经济补偿金系数
    let multiplier = 0;
    const years = monthsOfService / 12;
    const fullYears = Math.floor(years);
    const remainingMonths = monthsOfService % 12;

    multiplier += fullYears;
    if (remainingMonths >= 6) {
      multiplier += 1.0;
    } else if (remainingMonths > 0) {
      multiplier += 0.5;
    }

    // 2. 高薪封顶规则
    const capSalary = localAverageSalary * 3;
    let actualBaseSalary = monthlySalary;
    let isCapped = false;

    if (monthlySalary > capSalary) {
      actualBaseSalary = capSalary;
      isCapped = true;
      if (multiplier > 12) {
        multiplier = 12;
      }
    }

    // 3. 计算基础经济补偿金
    const baseCompensation = actualBaseSalary * multiplier;

    // 4. 违法解除加倍赔偿
    const finalCompensation = isIllegalDismissal ? baseCompensation * 2 : baseCompensation;

    return {
      success: true,
      formula: "经济补偿金 = 计算基数工资 * 补偿系数 (工作年限) " + (isIllegalDismissal ? "* 2 (违法解除双倍)" : ""),
      inputs: {
        monthlySalary,
        monthsOfService,
        isIllegalDismissal,
        localAverageSalary
      },
      calculation: {
        actualBaseSalary,
        isCapped,
        multiplier,
        baseCompensation,
        finalCompensation,
        resultSummary: `计算基数工资为 ${actualBaseSalary} 元/月（${isCapped ? '已触发三倍社平工资封顶' : '未封顶'}），工作月数折算为 ${multiplier} 个月补偿基数。` +
                       `基础经济补偿金为 ${baseCompensation} 元。` +
                       (isIllegalDismissal ? `因属于违法解除，依法翻倍赔偿，最终应得赔偿金总额为 ${finalCompensation} 元。` : `法定经济补偿金总额为 ${finalCompensation} 元。`)
      }
    };
  }
  
  throw new Error(`Unknown tool: ${name}`);
}
