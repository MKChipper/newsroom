import { next } from "@vercel/functions";

declare const process: { env: Record<string, string | undefined> };

const REALM = "Newsroom";

export default function middleware(request: Request) {
  const expected = process.env.NEWSROOM_BASIC_AUTH;
  if (!expected) return next();

  const authorization = request.headers.get("authorization");
  const wanted = `Basic ${btoa(expected)}`;
  if (authorization === wanted) return next();

  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}
