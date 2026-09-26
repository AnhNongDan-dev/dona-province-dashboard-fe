import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 60 * 60 * 1000,
      staleTime: 30 * 60 * 1000,
      retry: false,
    },
  },
});
