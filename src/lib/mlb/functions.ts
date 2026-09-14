import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchSlate, gradePublishedCards, runAnalysis } from "./engine.server";
import { savePublishedCard, syncLedgerWindow, type LedgerDay } from "./ledger.server";
import { todayEt } from "./parse";
import type { AnalysisResult, GradedPublished, SlateResult } from "./types";

const DateInput = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const getSlate = createServerFn({ method: "POST" })
  .validator((input: unknown) => DateInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<SlateResult> => {
    const date = data.date ?? todayEt();
    return fetchSlate(date);
  });

export const analyzePicks = createServerFn({ method: "POST" })
  .validator((input: unknown) => DateInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<AnalysisResult> => {
    const date = data.date ?? todayEt();
    const result = await runAnalysis(date);
    try {
      await savePublishedCard({
        date: result.date,
        version: result.model.version,
        slips: result.slips,
        grade: result.grade,
      });
    } catch {
      /* ledger is best-effort */
    }
    return result;
  });

const SlipLegInput = z.object({
  playerId: z.number(),
  name: z.string(),
  teamAbbr: z.string(),
  opponentAbbr: z.string(),
  market: z.enum(["hr", "hits", "tb", "rbi", "sb", "k", "hrrbi", "runs", "fs"]),
  stat: z.string(),
  line: z.number(),
  side: z.enum(["over", "under"]),
  oddsType: z.enum(["standard", "demon", "goblin"]),
  score: z.number(),
  lean: z.enum(["smash", "strong", "lean", "spec"]),
  reason: z.string(),
  cover: z.number(),
  lineupStatus: z.enum(["confirmed", "expected", "none"]).optional(),
  result: z.enum(["hit", "miss", "dnp", "pending"]).optional(),
  actual: z.number().nullable().optional(),
});

const SlipCardInput = z.object({
  size: z.union([z.literal(2), z.literal(3), z.literal(6)]),
  title: z.string(),
  date: z.string(),
  confidence: z.number(),
  lean: z.enum(["smash", "strong", "lean", "spec"]),
  legs: z.array(SlipLegInput).max(8),
  notes: z.string(),
});

const GradeInput = z.object({
  cards: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        slips: z.array(SlipCardInput).max(4),
      }),
    )
    .min(1)
    .max(8),
});

export const gradeCards = createServerFn({ method: "POST" })
  .validator((input: unknown) => GradeInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<GradedPublished[]> => {
    const graded = await gradePublishedCards(data.cards);
    for (const card of graded) {
      try {
        await savePublishedCard({
          date: card.date,
          version: "2.0",
          slips: card.slips,
          grade: card.grade,
          complete: card.complete,
          finals: card.finals,
          live: card.live,
          games: card.games,
        });
      } catch {
        /* ignore */
      }
    }
    return graded;
  });

export const loadLedger = createServerFn({ method: "POST" })
  .validator((input: unknown) => DateInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<LedgerDay[]> => {
    return syncLedgerWindow(data.date);
  });

const SaveCardInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  version: z.string(),
  slips: z.array(SlipCardInput).max(4),
  grade: z
    .object({
      hits: z.number(),
      n: z.number(),
      dnp: z.number(),
      summary: z.string(),
    })
    .nullable(),
});

export const saveCard = createServerFn({ method: "POST" })
  .validator((input: unknown) => SaveCardInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<LedgerDay[]> => {
    return savePublishedCard(data);
  });
