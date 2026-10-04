import "dotenv/config";
import { ApiFootballSmokeError, runApiFootballSmoke } from "./api-football-smoke.js";

function positiveInteger(value: string | undefined, name: string): number {
  if (!value || !/^\d+$/.test(value)) throw new ApiFootballSmokeError(`${name} must be set to a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new ApiFootballSmokeError(`${name} must be set to a positive integer.`);
  return parsed;
}

try {
  const result = await runApiFootballSmoke({
    apiKey: process.env.API_FOOTBALL_API_KEY ?? "",
    leagueId: positiveInteger(process.env.API_FOOTBALL_LEAGUE_ID, "API_FOOTBALL_LEAGUE_ID"),
    season: positiveInteger(process.env.API_FOOTBALL_SEASON ?? "2026", "API_FOOTBALL_SEASON"),
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (error instanceof ApiFootballSmokeError) {
    console.error(`API-Football smoke stopped: ${error.message}`);
  } else {
    console.error("API-Football smoke stopped unexpectedly; no response data was printed.");
  }
  process.exitCode = 1;
}
