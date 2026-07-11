import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "./landing";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <LandingPage />;
}
