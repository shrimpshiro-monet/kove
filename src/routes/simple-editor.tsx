import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/simple-editor")({
  beforeLoad: () => {
    throw redirect({ to: "/chat" });
  },
  component: () => null,
});
