import { corsHeaders } from "../shared/google-places";
import {
  defaultOwnerPricingSettings,
  toPublicOwnerPricingConfig,
} from "../shared/owner-pricing-config";
import {
  PREVIEW_PRICING_FORBIDDEN_CODE,
  PREVIEW_PRICING_FORBIDDEN_MESSAGE,
  requestIsPricingPreview,
} from "../shared/pricing-preview-isolation";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  getOwnerPricingSettings,
  listOwnerPricingAudit,
  OwnerPricingConflictError,
  OwnerPricingValidationError,
  saveOwnerPricingSettings,
} from "./owner-pricing-store";

export type OwnerPricingEnv = DriverAuthEnv & {
  TRACKING_STORE?: KVNamespace;
};

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

export function isOwnerPricingPath(pathname: string): boolean {
  return pathname === "/owner/pricing" || pathname === "/api/owner/pricing";
}

export function isPublicPricingConfigPath(pathname: string): boolean {
  return pathname === "/pricing/public" || pathname === "/api/pricing/public";
}

export async function loadOwnerPricingOrDefault(env?: {
  TRACKING_STORE?: KVNamespace;
}) {
  if (!env?.TRACKING_STORE) {
    return defaultOwnerPricingSettings();
  }
  return getOwnerPricingSettings(env.TRACKING_STORE);
}

export async function handlePublicGetPricingConfig(
  env: { TRACKING_STORE?: KVNamespace },
  origin: string | null,
): Promise<Response> {
  const settings = await loadOwnerPricingOrDefault(env);
  return json({ ok: true, config: toPublicOwnerPricingConfig(settings) }, 200, origin);
}

export async function handleOwnerPricingRequest(
  request: Request,
  env: OwnerPricingEnv,
  origin: string | null,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (!env.TRACKING_STORE) {
    return json({ error: "Storage is not configured" }, 503, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return json({ error: "Unauthorized — owner access required." }, 401, origin);
  }

  if (request.method !== "GET" && requestIsPricingPreview(request)) {
    return json(
      {
        error: PREVIEW_PRICING_FORBIDDEN_MESSAGE,
        code: PREVIEW_PRICING_FORBIDDEN_CODE,
      },
      403,
      origin,
    );
  }

  if (request.method === "GET") {
    const settings = await getOwnerPricingSettings(env.TRACKING_STORE);
    const audit = await listOwnerPricingAudit(env.TRACKING_STORE);
    return json(
      {
        ok: true,
        settings,
        defaults: defaultOwnerPricingSettings(),
        audit,
      },
      200,
      origin,
    );
  }

  if (request.method !== "POST" && request.method !== "PUT") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  try {
    const result = await saveOwnerPricingSettings(env.TRACKING_STORE, body.settings ?? body, {
      expectedVersion: Number(body.expectedVersion ?? (body.settings as { version?: number } | undefined)?.version),
      actor: "owner",
      restoreDefaults: body.action === "restore-defaults",
    });
    return json(
      {
        ok: true,
        settings: result.settings,
        defaults: defaultOwnerPricingSettings(),
        audit: result.audit,
      },
      200,
      origin,
    );
  } catch (error) {
    if (error instanceof OwnerPricingConflictError) {
      return json({ error: error.message, code: error.code }, 409, origin);
    }
    if (error instanceof OwnerPricingValidationError) {
      return json({ error: error.message, code: error.code, errors: error.errors }, 400, origin);
    }
    throw error;
  }
}
