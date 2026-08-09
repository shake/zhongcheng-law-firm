import { requireAccess } from "../_shared/access";

interface Env {
  DB: any;
  CF_ACCESS_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_ALLOWED_EMAILS?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const accessResponse = await requireAccess(context);
  if (accessResponse) {
    return accessResponse;
  }

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache"
  };

  if (!context.env.DB) {
    return new Response(JSON.stringify({
      success: false,
      error: "Cloudflare D1 数据库未绑定。"
    }), { status: 500, headers });
  }

  try {
    const { results } = await context.env.DB.prepare(
      "SELECT id, email, question, response, datetime(created_at, 'localtime') as created_at FROM consultation_logs ORDER BY id DESC LIMIT 200"
    ).all();

    return new Response(JSON.stringify({ success: true, logs: results }), {
      status: 200,
      headers
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message || error
    }), { status: 500, headers });
  }
};
