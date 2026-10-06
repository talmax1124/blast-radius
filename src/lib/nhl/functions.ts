import { createServerFn } from "@tanstack/react-start";
import { buildNhlBoard } from "./engine.server";
import type { NhlBoard } from "./types";

export const analyzeNhl = createServerFn({ method: "POST" }).handler(async (): Promise<NhlBoard> => {
  return buildNhlBoard();
});
