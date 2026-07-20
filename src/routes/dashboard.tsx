import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../components/dashboard/DashboardPage";

interface DashboardSearch {
  page?: "overview" | "projects";
}

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    page: (search.page as "overview" | "projects") || "overview",
  }),
});
