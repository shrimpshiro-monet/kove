import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../components/dashboard/DashboardPage";

interface DashboardSearch {
  page?: "overview" | "projects" | "affiliate";
}

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    page: (search.page as "overview" | "projects" | "affiliate") || "overview",
  }),
});
