import { createFileRoute } from "@tanstack/react-router";
import { SoccerDesk } from "@/components/desk/soccer-desk";

export const Route = createFileRoute("/soccer")({ component: SoccerDesk });
