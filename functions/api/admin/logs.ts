interface Env {
  DB: any; // Cloudflare D1 Database binding
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  // Set CORS or response headers
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  };

  if (!env.DB) {
    return new Response(JSON.stringify({
      success: false,
      error: "Cloudflare D1 数据库未绑定。请在 Pages 控制台 -> Settings -> Functions -> D1 bindings 中绑定变量名 'DB' 到您的 D1 数据库。"
    }), { status: 500, headers });
  }

  try {
    // Query last 200 logs sorted by newest first
    const { results } = await env.DB.prepare(
      "SELECT id, email, question, response, datetime(created_at, 'localtime') as created_at FROM consultation_logs ORDER BY id DESC LIMIT 200"
    ).all();

    return new Response(JSON.stringify({
      success: true,
      logs: results
    }), {
      status: 200,
      headers
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message || error
    }), {
      status: 500,
      headers
    });
  }
};
