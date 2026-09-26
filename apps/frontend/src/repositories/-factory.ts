import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { UseQueryOptions } from "@tanstack/react-query";
import { keepPreviousData, type QueryKey, useQuery } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { z } from "zod";
import { queryClient } from "@/config/query-client.config";
import { logger } from "@/lib/client-logger";

type CreateQueryRepositoryOptions<TData, TParams = never> = {
  queryKey: (params: TParams) => QueryKey;
  queryFn: (params: TParams) => Promise<TData>;
  defaultData: NonNullable<TData>;
  searchMode?: boolean;
  queryOptions?: Omit<UseQueryOptions<TData, Error, TData, QueryKey>, "queryKey" | "queryFn">;
};

type MaybeParams<T> = T extends void ? [] : [params: T];

export function createQueryRepository<TData, TParams = void>({
  queryKey,
  queryFn,
  defaultData,
  searchMode = false,
  queryOptions,
}: CreateQueryRepositoryOptions<TData, TParams>) {
  return (...args: MaybeParams<TParams>) => {
    const params = (args[0] as TParams)!;

    const resolvedKey = queryKey(params);

    // `overrideOptions` lets a call site pass per-render query options the
    // static `queryOptions` can't express — chiefly a functional `refetchInterval`
    // that reads live query state (e.g. poll while a report is still being generated).
    // Merged after `queryOptions` so it wins, but before queryKey/queryFn so those
    // stay owned by the repository.
    const useRepositoryQuery = (
      overrideOptions?: Partial<
        Omit<UseQueryOptions<TData, Error, TData, QueryKey>, "queryKey" | "queryFn">
      >,
    ) => {
      const result = useQuery<TData, Error>({
        // `notifyOnChangeProps: 'all'` is required because we return a *spread
        // copy* (`{ ...result, data }`) below. `useQuery` normally returns a
        // tracking Proxy that re-renders only on accessed props; spreading it
        // into a plain object defeats that tracking, so without 'all' a
        // background cache update (e.g. settings loaded after login) would not
        // re-render an already-mounted consumer — the source of the dead theme
        // toggle. A caller can still override via queryOptions.
        notifyOnChangeProps: "all",
        ...queryOptions,
        ...overrideOptions,
        queryKey: resolvedKey,
        queryFn: () => queryFn(params),
        placeholderData: searchMode ? keepPreviousData : queryOptions?.placeholderData,
      });

      return { ...result, data: result.data ?? defaultData };
    };

    const loader = async () => {
      const queryState = queryClient.getQueryState(resolvedKey);
      const { isInvalidated = true } = queryState || {};

      const fetchFn = async () => {
        if (isInvalidated) {
          return queryClient.fetchQuery({
            queryKey: resolvedKey,
            queryFn: () => queryFn(params),
          });
        }

        return queryClient.ensureQueryData({
          queryKey: resolvedKey,
          queryFn: () => queryFn(params),
        });
      };

      return fetchFn().catch((e) => {
        if (isRedirect(e)) throw e;
        if (e instanceof Error) {
          const parsedError = z.object({ errorCode: z.enum(ErrorCode) }).safeParse(e.cause);
          if (parsedError.success) {
            logger.info("logger ~ -createQueryRepository.ts ~ line 50:", parsedError);
            // throwIfUnauthorizeError(parsedError.data.errorCode);
            // throwIfForbiddenError(parsedError.data.errorCode);
          }
        }
        logger.warn("Loader error but not throw redirect", e);
        return defaultData;
      });
    };

    const updateCache = (updater: Partial<TData> | ((old: TData) => TData)) =>
      queryClient.setQueryData<TData>(resolvedKey, (old) => {
        // When the cache entry is missing (e.g. just after queryClient.clear() on
        // login, before the query has resolved), fall back to defaultData as the
        // base instead of dropping the write — otherwise an optimistic update
        // applied in that window is silently swallowed.
        const base = old ?? (defaultData as TData);

        if (typeof updater === "function") {
          return updater(base);
        }

        return {
          ...base,
          ...updater,
        };
      });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: resolvedKey });

    const get = () => queryClient.getQueryData<TData>(resolvedKey);

    const refetch = async () => {
      await queryClient.refetchQueries({
        queryKey: resolvedKey,
      });
      return get() || defaultData;
    };

    return {
      queryKey: resolvedKey,
      useQuery: useRepositoryQuery,
      loader,
      updateCache,
      invalidate,
      get,
      refetch,
    };
  };
}
