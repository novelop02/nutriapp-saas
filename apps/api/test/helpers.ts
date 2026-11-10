export function setCookies(res: { headers: unknown }): string[] {
  const raw = (res.headers as Record<string, unknown>)["set-cookie"];
  return Array.isArray(raw) ? raw.map(String) : [];
}

export function findCookie(res: { headers: unknown }, name: string): string | undefined {
  return setCookies(res).find((c) => c.startsWith(`${name}=`));
}

export function cookieValue(res: { headers: unknown }, name: string): string | undefined {
  return findCookie(res, name)
    ?.split(";")[0]
    ?.slice(name.length + 1);
}

export function requireCookieValue(res: { headers: unknown }, name: string): string {
  const value = cookieValue(res, name);
  if (!value) throw new Error(`Response did not set the ${name} cookie`);
  return value;
}
