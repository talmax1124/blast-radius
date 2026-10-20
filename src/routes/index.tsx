import { createFileRoute } from "@tanstack/react-router";
import { FrontDesk } from "@/components/desk/front-desk";

export const Route = createFileRoute("/")({ component: FrontDesk });
