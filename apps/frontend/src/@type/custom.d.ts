export type NonFunctionProperties<T> = {
  [K in keyof T as T[K] extends (...args: infer _P) => infer _F ? never : K]: T[K];
};
