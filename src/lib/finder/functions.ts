import { createServerFn } from "@tanstack/react-start";
import { buildFinder } from "./engine.server";
import type { FinderBoard } from "./types";

export const analyzeFinder = createServerFn({ method: "POST" }).handler(async (): Promise<FinderBoard> => {
  return buildFinder();
});
