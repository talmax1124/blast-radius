import { createServerFn } from "@tanstack/react-start";
import { loadSlate, type SlateBoard } from "./slate.server";
import { loadTennis } from "./tennis.server";
import type { TennisMatch } from "./types";

export const loadTennisSlate = createServerFn({ method: "POST" }).handler(async (): Promise<TennisMatch[]> => {
  return loadTennis();
});

export const loadSlateBoard = createServerFn({ method: "POST" }).handler(async (): Promise<SlateBoard> => {
  return loadSlate();
});
