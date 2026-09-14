import { createFileRoute } from "@tanstack/react-router";
import { AppDesk } from "@/components/desk/app-desk";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <AppDesk />;
}
