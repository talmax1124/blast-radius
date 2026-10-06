import { createServerFn } from "@tanstack/react-start";
import { buildNflBoard } from "./engine.server";
import type { NflBoard } from "./types";

export const analyzeNfl = createServerFn({ method: "POST" }).handler(async (): Promise<NflBoard> => {
  return buildNflBoard();
});
