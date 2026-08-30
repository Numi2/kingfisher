import { NextResponse } from "next/server";
import { KINGFISHER_VERSION } from "../../lib/KingfisherGameEngine";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    game: "aspen-kingfisher-living-river",
    version: KINGFISHER_VERSION,
    mcp: "/mcp",
    gamePath: "/game",
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
