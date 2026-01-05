import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

/**
 * Create a configured QueryClient with performance optimizations
 *
 * Performance optimizations implemented (Requirement 13.2):
 * - staleTime: 30s - Caches queries for 30 seconds before considering them stale
 * - gcTime: 5min - Keeps unused data in cache for 5 minutes
 * - refetchOnWindowFocus: false - Prevents unnecessary refetches
 * - retry: 1 - Limits retry attempts to reduce latency on errors
 */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000, // 30 seconds - data is considered fresh
        gcTime: 5 * 60 * 1000, // 5 minutes - cache time (formerly cacheTime)
        refetchOnWindowFocus: false, // Prevent unnecessary refetches
        retry: 1, // Only retry once on failure
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
