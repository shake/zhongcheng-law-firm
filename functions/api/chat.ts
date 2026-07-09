interface Env {
  VECTORIZE: any;
  AI: any;
  GEMINI_API_KEY: string;
  CLERK_SECRET_KEY?: string; // Optional: for Clerk server-side JWT verification
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // 1. Only allow POST requests
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // 2. Validate Gemini API Key presence
  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({
      success: false,
      error: "Missing GEMINI_API_KEY in Cloudflare environment variables. Please add it in your Pages settings."
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

    // 3. User Authentication Check (Clerk JWT validation placeholder)
    // Front-end will pass: Authorization: Bearer <clerk_session_token>
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized: Missing or invalid authentication token', { status: 401 });
    }
    const token = authHeader.split(' ')[1];

    // NOTE: You can verify the Clerk JWT token here using Clerk JWKs.
    // For initial development/testing, we assume a token is passed from Clerk frontend.
    if (env.CLERK_SECRET_KEY) {
      // Optional verification logic: verify token signature with Clerk public keys
      const isValid = await verifyClerkToken(token, env.CLERK_SECRET_KEY);
      if (!isValid) {
        return new Response('Unauthorized: Session has expired or is invalid', { status: 401 });
      }
    }

    // 4. Generate Embedding for the User's Question (1024 dims)
    const embeddingResponse = await env.AI.run('@cf/baai/bge-m3', {
      text: [message]
    });

    if (!embeddingResponse || !embeddingResponse.data || !embeddingResponse.data[0]) {
      throw new Error('Failed to generate embedding for the question.');
    }
    const questionVector = embeddingResponse.data[0];

    // 5. Query Cloudflare Vectorize Index
    const vectorizeResults = await env.VECTORIZE.query(questionVector, {
      topK: 3,
      returnMetadata: 'all'
    });

    // 6. Format Law Context for Prompt Injection
    let lawContext = '';
    if (vectorizeResults && vectorizeResults.matches && vectorizeResults.matches.length > 0) {
      lawContext = vectorizeResults.matches
        .map((match: any, idx: number) => {
          const text = match.metadata?.text || '条款内容缺失';
          const score = Math.round(match.score * 100);
          return `【参考法条 ${idx + 1} (匹配相关度: ${score}%)】\n${text}`;
        })
        .join('\n\n');
    } else {
      lawContext = '未在数据库中检索到直接相关的《中华人民共和国劳动法》条文。';
    }

    // 7. Define System Prompt and combine it with context and user message for absolute compatibility
    const promptText = `你是一位专业、严谨且温和的劳动法咨询合伙人律师。请根据下面提供的《中华人民共和国劳动法》相关法条上下文，解答用户的具体提问。

你的回答应当满足以下结构要求：
1. 【首诊研判】：基于用户描述的事实，先给出核心法理定性与结论（用人单位是否违法）。
2. 【法条引述】：在回答中明确引述并列出支持你结论的具体法律条款（直接引证后面参考法条的内容）。
3. 【行动指引】：为劳动者提供可操作的建议，如收集哪些证据、向什么部门投诉、如何申请仲裁等。
4. 【专业免责】：在回答的最后，附加一句话的专业免责声明，指出本答复基于AI大模型及导入数据生成，仅供学术参考，具体个案建议咨询专业律师。

请始终使用中文进行回答，格式使用 Markdown 排版。

下面是为您检索到的【参考劳动法条款】：
${lawContext}

用户提问的问题是：
"${message}"`;

    // 8. Stream from Gemini 1.5 Flash using stable v1 API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:streamGenerateContent?key=${env.GEMINI_API_KEY}`;
    
    const geminiResponse = await fetch(geminiUrl, {
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

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API returned status ${geminiResponse.status}: ${errText}`);
    }

    // 9. Process and Stream the response chunk-by-chunk using a TransformStream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = geminiResponse.body?.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Asynchronously consume the incoming Gemini stream
    (async () => {
      let buffer = '';
      try {
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Gemini streams a chunked JSON array. We parse and extract "text" keys.
          const textTokens = extractTextFromGeminiChunk(buffer);
          if (textTokens) {
            await writer.write(encoder.encode(textTokens));
            // Keep buffer clear of already matched tokens to avoid duplication
            buffer = ''; 
          }
        }
      } catch (err: any) {
        await writer.write(encoder.encode(`\n[流传输错误: ${err.message}]`));
      } finally {
        await writer.close();
      }
    })();

    // Return the stream directly to the browser
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

/**
 * Extracts raw text tokens from a partial Gemini JSON stream buffer.
 */
function extractTextFromGeminiChunk(buffer: string): string {
  // Regex to match "text": "string content"
  const matches = buffer.match(/"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g);
  if (!matches) return '';
  
  let result = '';
  for (const match of matches) {
    const valMatch = match.match(/"text"\s*:\s*"(.*)"/);
    if (valMatch && valMatch[1]) {
      try {
        // Correctly parse JSON escaped strings (like \n, \", etc.)
        const parsed = JSON.parse(`"${valMatch[1]}"`);
        result += parsed;
      } catch (e) {
        result += valMatch[1]; // Fallback
      }
    }
  }
  return result;
}

/**
 * Simple validation checks for Clerk JWT Session Tokens.
 * Under production, verify Clerk RS256 signature using JWKS.
 */
async function verifyClerkToken(token: string, clerkSecretKey: string): Promise<boolean> {
  if (!token) return false;
  try {
    // Basic structural check of JWT
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Decode payload to check expiry
    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
      return false; // Expired
    }
    return true;
  } catch {
    return false;
  }
}
