import { createRemoteJWKSet, jwtVerify } from "jose";

type AccessContext = {
  request: Request;
  env: {
    CF_ACCESS_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    CF_ACCESS_ALLOWED_EMAILS?: string;
  };
};

type AccessPayload = {
  email?: string;
  sub?: string;
};

const jwkCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getTeamDomain(domain: string) {
  return domain.replace(/\/+$/, "");
}

function getJwks(domain: string) {
  const normalized = getTeamDomain(domain);
  const cached = jwkCache.get(normalized);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(new URL(`${normalized}/cdn-cgi/access/certs`));
  jwkCache.set(normalized, jwks);
  return jwks;
}

export async function requireAccess(context: AccessContext) {
  const domain = context.env.CF_ACCESS_DOMAIN;
  const aud = context.env.CF_ACCESS_AUD;

  if (!domain || !aud) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing Cloudflare Access configuration. Set CF_ACCESS_DOMAIN and CF_ACCESS_AUD."
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" }
      }
    );
  }

  const token = context.request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const { payload } = await jwtVerify<AccessPayload>(token, getJwks(domain), {
      audience: aud,
      issuer: getTeamDomain(domain)
    });

    const allowedEmails = getAllowedEmails(context.env.CF_ACCESS_ALLOWED_EMAILS);
    const email = normalizeEmail(payload.email || "");

    if (allowedEmails.length > 0 && (!email || !allowedEmails.includes(email))) {
      return new Response("Forbidden", { status: 403 });
    }

    return null;
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
}

function getAllowedEmails(value?: string) {
  const raw = (value || "shakechen@126.com,shake.chen@gmail.com").split(",");
  return raw.map((item) => normalizeEmail(item)).filter(Boolean);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
