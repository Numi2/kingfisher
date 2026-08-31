import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    game: "aspen-kingfisher-living-river",
    version: "1.0.0",
    mcp: "/mcp",
    gamePath: "/game",
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
