import { createServerFn } from "@tanstack/react-start";
import { buildFront } from "./engine.server";
import type { FrontBoard } from "./engine.server";

export const analyzeFront = createServerFn({ method: "POST" }).handler(async (): Promise<FrontBoard> => {
  return buildFront();
});
