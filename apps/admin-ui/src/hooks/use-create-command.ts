import { useCallback } from "react";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import {
  type CreateIntentKey,
  useTriggerCreateIntent,
} from "@/hooks/use-create-intent";

function normalizePathname(pathname: string) {
  if (pathname.length <= 1) return pathname;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function useCreateCommand() {
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const triggerCreateIntent = useTriggerCreateIntent();

  const preloadRoute = useCallback(
    (to: string) => {
      void router.preloadRoute({ to });
    },
    [router],
  );

  const runCreateCommand = useCallback(
    (to: string, intent: CreateIntentKey) => {
      if (normalizePathname(location.pathname) === normalizePathname(to)) {
        triggerCreateIntent(intent);
        return;
      }

      void Promise.resolve(navigate({ to, search: {} }))
        .then(() => {
          if (
            normalizePathname(router.state.location.pathname) !==
            normalizePathname(to)
          ) {
            return;
          }
          triggerCreateIntent(intent);
        })
        .catch(() => {
          // Navigation was interrupted; do not retain create intent.
        });
    },
    [
      location.pathname,
      navigate,
      router.state.location.pathname,
      triggerCreateIntent,
    ],
  );

  return { runCreateCommand, preloadRoute };
}
