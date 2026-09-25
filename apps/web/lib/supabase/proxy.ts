import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const protectedPagePrefixes = ["/dashboard", "/onboarding", "/account"];

function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && publishableKey ? { url, publishableKey } : null;
}

function requestHadAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
}

function nextResponse(request: NextRequest, forwardedHeaders?: Headers) {
  return NextResponse.next({ request: forwardedHeaders ? { headers: forwardedHeaders } : request });
}

export async function updateSession(request: NextRequest, forwardedHeaders?: Headers) {
  const config = authConfig();
  const pathname = request.nextUrl.pathname;
  const protectedPage = protectedPagePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const hadAuthCookie = requestHadAuthCookie(request);

  if (!config) {
    if (protectedPage) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.searchParams.set("error", "auth_not_configured");
      login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
    return nextResponse(request, forwardedHeaders);
  }

  let response = nextResponse(request, forwardedHeaders);
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextResponse(request, forwardedHeaders);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        if (headersToSet) {
          new Headers(headersToSet).forEach((value, key) => response.headers.set(key, value));
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (protectedPage && !user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("error", hadAuthCookie ? "session_expired" : "session_required");
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  if (pathname === "/login" && user) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/dashboard";
    destination.search = "";
    return NextResponse.redirect(destination);
  }

  return response;
}
