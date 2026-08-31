import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    game: "aspen-kingfisher-living-river",
    version: "1.2.1",
    mcp: "/mcp",
    gamePath: "/game",
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
