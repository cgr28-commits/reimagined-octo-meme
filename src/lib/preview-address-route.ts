import { handlePreviewAddressRequest } from "@/lib/preview-address-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.VERCEL_GIT_COMMIT_REF !== "feat/optional-terminal-access") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return handlePreviewAddressRequest(request, process.env.GOOGLE_MAPS_API_KEY);
}
