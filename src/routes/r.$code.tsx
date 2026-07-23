import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/r/$code")({
  beforeLoad: ({ params }) => {
    const code = params.code;
    if (code && code.length >= 3 && code.length <= 20) {
      document.cookie = `kove_ref=${encodeURIComponent(code)};path=/;max-age=2592000;samesite=lax`;
    }
    throw redirect({ to: "/sign-up" });
  },
});
