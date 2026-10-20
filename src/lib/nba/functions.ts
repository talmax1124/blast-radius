import { createServerFn } from "@tanstack/react-start";
import { buildNbaBoard } from "./engine.server";
import type { NbaBoard } from "./types";

export const analyzeNba = createServerFn({ method: "POST" }).handler(async (): Promise<NbaBoard> => {
  return buildNbaBoard();
});
