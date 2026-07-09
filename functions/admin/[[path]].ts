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
  return fetch(url.toString());
};
