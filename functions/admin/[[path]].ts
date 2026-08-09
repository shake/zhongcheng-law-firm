import { requireAccess } from "../_shared/access";

interface Env {
  ASSETS: any;
  CF_ACCESS_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const accessResponse = await requireAccess(context);
  if (accessResponse) {
    return accessResponse;
  }

  const assetUrl = new URL("/admin-panel/", context.request.url);
  return context.env.ASSETS.fetch(assetUrl);
};
