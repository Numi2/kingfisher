import { createMcpHandler } from "mcp-handler";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { baseURL } from "../../baseUrl";

const UI_VERSION = "2026-08-24-kingfisher-max-v1";
const RESOURCE_URI = `ui://aspen-kingfisher/river-hunt.html?v=${UI_VERSION}`;

async function fetchGameHtml() {
  const response = await fetch(`${baseURL}/game`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load kingfisher game UI: ${response.status}`);
  return response.text();
}

const handler = createMcpHandler(async (server) => {
  registerAppResource(
    server,
    "aspen-kingfisher-river-hunt-ui",
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await fetchGameHtml(),
          _meta: {
            ui: {
              csp: {
                connectDomains: [baseURL],
                resourceDomains: [baseURL],
              },
            },
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "launch_kingfisher_river_hunt",
    {
      title: "Launch Aspen Kingfisher River Hunt",
      description: "Open a cinematic 3D kingfisher wildlife game with a living river ecosystem, smart high-speed dives, rainbow trout and many other fish species, rare catches, field-guide progression, weather, wind, underwater hunting, and perch banking.",
      inputSchema: {
        mode: z.enum(["hunt", "free", "habitat", "controls", "guide"]).default("hunt").describe("Game mode or settings panel to open."),
        fishDensity: z.number().min(0.55).max(1.7).optional().describe("Relative number of fish in the river."),
        riverCurrent: z.number().min(0.45).max(1.85).optional().describe("Current strength and fish drift speed."),
        waterClarity: z.number().min(0.38).max(0.98).optional().describe("Water visibility and underwater fog."),
        wingPower: z.number().min(0.75).max(1.35).optional().describe("Kingfisher cruise, flap, and dive speed multiplier."),
        biodiversity: z.number().min(0.5).max(1.5).optional().describe("Rare-species abundance and fish diversity."),
        wind: z.number().min(0).max(1.6).optional().describe("Crosswind and gust strength above the river."),
        weather: z.number().min(0).max(1).optional().describe("Cloud cover, mist, and water roughness."),
        sensitivity: z.number().min(0.6).max(1.55).optional().describe("Steering response multiplier."),
        assist: z.number().min(0).max(0.86).optional().describe("Fish-targeting assistance during a dive."),
        invertY: z.boolean().optional().describe("Invert climb and descent input."),
        smartDive: z.boolean().optional().describe("Enable one-tap target lock and committed kingfisher dives."),
        reducedMotion: z.boolean().optional().describe("Disable impact camera shake."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ mode = "hunt", fishDensity, riverCurrent, waterClarity, wingPower, biodiversity, wind, weather, sensitivity, assist, invertY, smartDive, reducedMotion }) => {
      const launch = {
        mode,
        ...(fishDensity !== undefined ? { fishDensity } : {}),
        ...(riverCurrent !== undefined ? { riverCurrent } : {}),
        ...(waterClarity !== undefined ? { waterClarity } : {}),
        ...(wingPower !== undefined ? { wingPower } : {}),
        ...(biodiversity !== undefined ? { biodiversity } : {}),
        ...(wind !== undefined ? { wind } : {}),
        ...(weather !== undefined ? { weather } : {}),
        ...(sensitivity !== undefined ? { sensitivity } : {}),
        ...(assist !== undefined ? { assist } : {}),
        ...(invertY !== undefined ? { invertY } : {}),
        ...(smartDive !== undefined ? { smartDive } : {}),
        ...(reducedMotion !== undefined ? { reducedMotion } : {}),
      };
      return {
        content: [{ type: "text", text: `Opening Aspen Kingfisher River Hunt in ${mode} mode.` }],
        structuredContent: { launch },
      };
    },
  );
});

export const GET = handler;
export const POST = handler;
