type CookieLike = {
  name: string;
};

export function hasSupabaseAuthCookie(cookies: CookieLike[]) {
  return cookies.some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}
