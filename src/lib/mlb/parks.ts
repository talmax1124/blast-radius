/** Park factors, 100 = league average. */

export type ParkInfo = {
  hr: number;
  hits: number;
  k: number;
  sb: number;
  elevation: number;
};

export const PARKS: Record<number, ParkInfo> = {
  1: { hr: 101, hits: 101, k: 99, sb: 98, elevation: 160 },
  2: { hr: 109, hits: 104, k: 96, sb: 99, elevation: 20 },
  3: { hr: 106, hits: 110, k: 98, sb: 97, elevation: 20 },
  4: { hr: 108, hits: 103, k: 97, sb: 101, elevation: 595 },
  5: { hr: 100, hits: 100, k: 100, sb: 100, elevation: 650 },
  7: { hr: 91, hits: 98, k: 104, sb: 108, elevation: 910 },
  12: { hr: 92, hits: 97, k: 105, sb: 102, elevation: 40 },
  14: { hr: 104, hits: 102, k: 99, sb: 99, elevation: 268 },
  15: { hr: 101, hits: 101, k: 100, sb: 100, elevation: 1082 },
  17: { hr: 103, hits: 103, k: 99, sb: 98, elevation: 595 },
  19: { hr: 118, hits: 120, k: 86, sb: 104, elevation: 5200 },
  22: { hr: 103, hits: 101, k: 101, sb: 97, elevation: 500 },
  31: { hr: 93, hits: 96, k: 106, sb: 99, elevation: 730 },
  32: { hr: 103, hits: 102, k: 99, sb: 100, elevation: 615 },
  2392: { hr: 107, hits: 104, k: 97, sb: 101, elevation: 50 },
  2394: { hr: 96, hits: 98, k: 103, sb: 100, elevation: 600 },
  2395: { hr: 88, hits: 94, k: 108, sb: 99, elevation: 10 },
  2529: { hr: 116, hits: 108, k: 96, sb: 102, elevation: 25 },
  2534: { hr: 98, hits: 99, k: 102, sb: 100, elevation: 25 },
  2602: { hr: 114, hits: 106, k: 95, sb: 100, elevation: 490 },
  2680: { hr: 92, hits: 95, k: 107, sb: 101, elevation: 15 },
  2681: { hr: 111, hits: 104, k: 97, sb: 99, elevation: 20 },
  2889: { hr: 93, hits: 97, k: 105, sb: 98, elevation: 465 },
  3289: { hr: 98, hits: 99, k: 103, sb: 97, elevation: 10 },
  3309: { hr: 100, hits: 100, k: 101, sb: 100, elevation: 20 },
  3312: { hr: 98, hits: 99, k: 102, sb: 101, elevation: 840 },
  3313: { hr: 113, hits: 102, k: 99, sb: 98, elevation: 30 },
  4169: { hr: 94, hits: 97, k: 104, sb: 103, elevation: 5 },
  4705: { hr: 105, hits: 102, k: 99, sb: 100, elevation: 1001 },
  5325: { hr: 99, hits: 100, k: 101, sb: 102, elevation: 550 },
  680: { hr: 94, hits: 96, k: 106, sb: 100, elevation: 20 },
};

export function parkFactors(venueId: number, elevationFt?: number): { hr: number; hits: number; k: number; sb: number } {
  const known = PARKS[venueId];
  if (known) return { hr: known.hr, hits: known.hits, k: known.k, sb: known.sb };
  let hr = 100;
  if (elevationFt && elevationFt > 2000) hr = Math.round(100 + (elevationFt - 500) / 180);
  return {
    hr,
    hits: Math.round(100 + (hr - 100) * 0.5),
    k: Math.round(100 - (hr - 100) * 0.45),
    sb: 100,
  };
}

export function parkHrFactor(venueId: number, elevationFt?: number): number {
  return parkFactors(venueId, elevationFt).hr;
}

export function windCarry(opts: {
  windMph: number | null;
  windFromDeg: number | null;
  azimuth: number | null;
  tempF: number | null;
  elevationFt: number;
}): { carry: number; label: string } {
  const { windMph, windFromDeg, azimuth, tempF, elevationFt } = opts;
  let carry = 0.45;
  let label = "Neutral air";

  if (tempF != null) {
    carry += Math.max(-0.12, Math.min(0.14, (tempF - 72) / 140));
  }
  carry += Math.max(0, Math.min(0.12, (elevationFt - 400) / 20000));

  if (windMph != null && windFromDeg != null && azimuth != null) {
    const outDeg = (azimuth + 180) % 360;
    const delta = ((((windFromDeg - outDeg + 180) % 360) + 360) % 360) - 180;
    const towardCf = Math.cos((delta * Math.PI) / 180) * windMph;
    carry += Math.max(-0.18, Math.min(0.2, towardCf / 70));
    if (towardCf > 6) label = `Wind out ${Math.round(windMph)} mph`;
    else if (towardCf < -6) label = `Wind in ${Math.round(windMph)} mph`;
    else if (windMph >= 8) label = `Cross wind ${Math.round(windMph)} mph`;
    else label = `Calm, ${windMph.toFixed(0)} mph`;
  } else if (tempF != null) {
    label = tempF >= 82 ? `Hot air ${Math.round(tempF)}°` : `${Math.round(tempF)}°`;
  }

  return { carry: Math.max(0, Math.min(1, carry)), label };
}

export function normAbbr(raw: string | null | undefined): string {
  const u = (raw ?? "").toUpperCase();
  if (u === "ARI" || u === "AZ") return "AZ";
  if (u === "OAK" || u === "ATH") return "ATH";
  if (u === "WSN" || u === "WSH") return "WSH";
  if (u === "CHW" || u === "CWS") return "CWS";
  if (u === "TBR" || u === "TB") return "TB";
  if (u === "KCR" || u === "KC") return "KC";
  if (u === "SDP" || u === "SD") return "SD";
  if (u === "SFG" || u === "SF") return "SF";
  return u;
}
