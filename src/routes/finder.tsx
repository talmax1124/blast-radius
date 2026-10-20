import { createFileRoute } from "@tanstack/react-router";
import { FinderDesk } from "@/components/desk/finder-desk";

export const Route = createFileRoute("/finder")({
  component: FinderDesk,
});
