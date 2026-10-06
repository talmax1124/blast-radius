import { createFileRoute } from "@tanstack/react-router";
import { BoardDesk } from "@/components/desk/board-desk";

export const Route = createFileRoute("/board")({
  component: BoardDesk,
});
