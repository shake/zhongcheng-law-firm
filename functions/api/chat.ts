interface Env {
  VECTORIZE: any;
  AI: any;
  GEMINI_API_KEY: string;
  CLERK_SECRET_KEY?: string;
  DB?: any; // Cloudflare D1 Database binding
}

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

    // 1. Generate Query Vector using bge-m3 (1024 dims)
    const embeddingResponse = await env.AI.run('@cf/baai/bge-m3', {
      text: [message]
    });

    if (!embeddingResponse || !embeddingResponse.data || !embeddingResponse.data[0]) {
      throw new Error('Failed to generate embedding for the question.');
    }
    const questionVector = embeddingResponse.data[0];

    // 2. Query Vectorize with metadata-aware recall
    const searchHints = extractLawSearchHints(message);
    const vectorizeResults = await queryLawVectors(env, questionVector, searchHints);

    // 3. Construct Context
    let lawContext = '';
    if (vectorizeResults.length > 0) {
      lawContext = vectorizeResults
        .map((match: any, idx: number) => {
          const text = match.metadata?.text || '';
          const score = Math.round((match.score || 0) * 100);
          const chapter = match.metadata?.chapter ? ` · ${match.metadata.chapter}` : '';
          const article = match.metadata?.article ? ` ${match.metadata.article}` : '';
          return `【参考法条 ${idx + 1}${chapter}${article} (相关度: ${score}%)】\n${text}`;
        })
        .join('\n\n');
    } else {
      lawContext = '未在数据库中检索到直接相关的《中华人民共和国劳动法》条文。';
    }

    // 4. Construct Consolidated Prompt
    const promptText = `你是一位专业、严谨、温和且高效的劳动法合伙人律师。请结合下面提供的法律条例上下文，用最精炼、无冗余的语言解答用户的具体提问，避免任何语义重复。

你的回答应当满足以下严密的结构要求：
1. 【初步评估】：用2-3句话直接给出核心法律评估与定性结论（用人单位是否违法，劳动者的法定权利是什么）。此处只需简要陈述结论，切勿在此处引用法条原文或展开解释，以防与后续内容重复。
2. 【法条引述】：列出支持你结论的法律条款。仅列出条文序号与条文的核心原文，不要在这里加解释性描述。
3. 【行动指引】：为劳动者提供3-4条最核心、可操作的维权步骤（例如：书面通知、保留关键证据、申请仲裁等），每条建议要简短有力，避免废话。
4. 【专业免责】：在回答的最后，附加一句话的专业免责声明。

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

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

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
    source?: string;
  };
};

type LawSearchHints = {
  chapter?: string;
  article?: string;
};

async function queryLawVectors(env: Env, questionVector: number[], hints: LawSearchHints) {
  const queries: Array<{
    filter?: Record<string, string>;
    topK: number;
  }> = [];

  if (hints.article) {
    queries.push({ filter: { article: hints.article }, topK: 6 });
  } else if (hints.chapter) {
    queries.push({ filter: { chapter: hints.chapter }, topK: 6 });
  }

  queries.push({ topK: 8 });

  const results = await Promise.all(
    queries.map((query) =>
      env.VECTORIZE.query(questionVector, {
        topK: query.topK,
        filter: query.filter,
        returnMetadata: 'all',
        returnValues: false
      })
    )
  );

  return mergeVectorMatches(results.flatMap((item) => item?.matches || []));
}

function mergeVectorMatches(matches: VectorizeMatch[]) {
  const seen = new Set<string>();
  const merged: VectorizeMatch[] = [];

  for (const match of matches) {
    const key = match.id || `${match.metadata?.chapter || ''}:${match.metadata?.article || ''}:${match.metadata?.text || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(match);
  }

  return merged.slice(0, 8);
}

function extractLawSearchHints(message: string): LawSearchHints {
  const normalized = message.replace(/\s+/g, '');
  const articleMatch = normalized.match(/第(?:[一二三四五六七八九十百]+|\d+)条/);
  const chapterMatch = normalized.match(/第(?:[一二三四五六七八九十百]+|\d+)章/);

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
