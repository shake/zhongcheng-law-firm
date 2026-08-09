import { requireAccess } from "../_shared/access";

interface Env {
  CF_ACCESS_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const accessResponse = await requireAccess(context);
  if (accessResponse) {
    return accessResponse;
  }

  const url = new URL("/admin.html", context.request.url);
  const headers = new Headers();
  const accessToken = context.request.headers.get("Cf-Access-Jwt-Assertion");
  const cookie = context.request.headers.get("Cookie");
  if (accessToken) headers.set("Cf-Access-Jwt-Assertion", accessToken);
  if (cookie) headers.set("Cookie", cookie);
  return fetch(url.toString(), { headers });
};
