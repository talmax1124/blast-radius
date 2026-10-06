import { createFileRoute } from "@tanstack/react-router";
import { NflDesk } from "@/components/desk/nfl-desk";

export const Route = createFileRoute("/nfl")({
  component: NflDesk,
});
