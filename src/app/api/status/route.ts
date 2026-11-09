import { NextResponse } from "next/server";
import { resolveRomeNetwork, ROME_STRATEGIES } from "@/lib/rome-config";
import deploymentsData from "@/lib/deployments.json";

export async function GET() {
  const hadrian = resolveRomeNetwork(200010);
  const rubicon = resolveRomeNetwork(7531);

  return NextResponse.json({
    ok: true,
    appName: "Veritas Port",
    architecture: "Portus — Dual-Lane Atomic Solana Lending Yield Port",
    hadrian,
    rubicon,
    strategies: ROME_STRATEGIES,
    deployments: deploymentsData,
  });
}
