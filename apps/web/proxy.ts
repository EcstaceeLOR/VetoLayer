import { NextResponse, type NextRequest } from "next/server";
import { isReliabilityTestMode } from "./lib/server/reliability-mode";
import { updateSession } from "./lib/supabase/proxy";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

export async function proxy(request: NextRequest) {
  const incoming = request.headers.get("x-vetolayer-request-id")?.trim();
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : `req_${crypto.randomUUID()}`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-vetolayer-request-id", requestId);

  if (isReliabilityTestMode()) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("x-vetolayer-request-id", requestId);
    return response;
  }

  const response = await updateSession(request, requestHeaders);
  response.headers.set("x-vetolayer-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
