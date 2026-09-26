import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 60 * 60 * 1000,
      staleTime: 30 * 60 * 1000,
      retry: false,
      // Mọi request /api/* có phiên đều kéo dài idle của phiên Central → không refetch nền,
      // nếu không máy để không mà phiên vẫn sống (TASK-001 F9).
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
