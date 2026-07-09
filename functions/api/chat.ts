interface Env {
  GEMINI_API_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context;
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
    const data = await response.json() as any;
    
    if (!response.ok) {
      return new Response(JSON.stringify({ error: data }), { status: response.status });
    }
    
    // Extract model names
    const models = data.models ? data.models.map((m: any) => m.name) : [];
    
    return new Response(JSON.stringify({
      success: true,
      message: "Here are the available models for your Gemini API Key:",
      models
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
