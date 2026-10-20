import { createServerFn } from "@tanstack/react-start";
import { buildSoccerBoard } from "./engine.server";
import type { SoccerBoard } from "./types";

export const analyzeSoccer = createServerFn({ method: "POST" }).handler(async (): Promise<SoccerBoard> => {
  return buildSoccerBoard();
});
