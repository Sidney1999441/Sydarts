import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl, hasSupabaseEnv } from "@/lib/env";
import { hasSupabaseAuthCookie } from "@/lib/supabase/cookies";
import { createTimedSupabaseFetch } from "@/lib/supabase/fetch";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function middleware(request: NextRequest) {
  if (!hasSupabaseEnv()) return NextResponse.next({ request });
  if (!hasSupabaseAuthCookie(request.cookies.getAll())) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: {
      fetch: createTimedSupabaseFetch(4500)
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  try {
    await supabase.auth.getUser();
  } catch {
    // Auth refresh is best-effort here; protected pages validate again before showing data.
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
