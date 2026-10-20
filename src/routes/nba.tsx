import { createFileRoute } from "@tanstack/react-router";
import { NbaDesk } from "@/components/desk/nba-desk";

export const Route = createFileRoute("/nba")({
  component: NbaDesk,
});
