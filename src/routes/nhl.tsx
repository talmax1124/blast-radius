import { createFileRoute } from "@tanstack/react-router";
import { NhlDesk } from "@/components/desk/nhl-desk";

export const Route = createFileRoute("/nhl")({
  component: NhlDesk,
});
