export type PagedResult<T> = {
  pageIndex: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  items: T[];
};

type BackendPagedEnvelope<T> = {
  data: T[];
  paging: {
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
    hasNext: boolean;
  };
};

export const mapPaging = <TIn, TOut>(
  envelope: BackendPagedEnvelope<TIn>,
  mapItem: (item: TIn) => TOut,
): PagedResult<TOut> => ({
  pageIndex: envelope.paging.page,
  pageSize: envelope.paging.size,
  total: envelope.paging.totalElements,
  hasNext: envelope.paging.hasNext,
  items: envelope.data.map(mapItem),
});

export const defaultPagedResult = <T>(): PagedResult<T> => ({
  pageIndex: 0,
  pageSize: 10,
  total: 0,
  hasNext: false,
  items: [],
});
