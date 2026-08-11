import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (!pathname.startsWith("/p/")) return NextResponse.next();

  const accept = request.headers.get("accept") ?? "*/*";
  const explicitlyMarkdown =
    pathname.endsWith(".md") ||
    searchParams.get("format") === "md" ||
    accept.includes("text/markdown") ||
    accept.includes("text/plain");
  const nonBrowserWildcard =
    accept.trim() === "*/*" && request.headers.get("sec-fetch-dest") !== "document";
  if (!explicitlyMarkdown && !nonBrowserWildcard) return NextResponse.next();

  const contentPath = pathname.endsWith(".md") ? pathname.slice(0, -3) : pathname;
  const url = request.nextUrl.clone();
  url.pathname = `/api/content/${contentPath.slice(3)}`;
  url.searchParams.delete("format");
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/p/:path*"] };
