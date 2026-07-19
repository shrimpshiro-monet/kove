import { create } from "zustand";

type Route = "/" | "/simple-editor" | "/editor";

interface RouterStore {
  route: Route;
  navigate: (path: string) => void;
}

function getRoute(): Route {
  const path = window.location.pathname;
  if (path === "/simple-editor") return "/simple-editor";
  if (path === "/editor") return "/editor";
  return "/";
}

export const useRouterStore = create<RouterStore>((set) => {
  window.addEventListener("popstate", () => {
    set({ route: getRoute() });
  });

  return {
    route: getRoute(),
    navigate: (path: string) => {
      window.history.pushState({}, "", path);
      set({ route: getRoute() });
    },
  };
});
