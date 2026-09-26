export const pickFields = <T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> =>
  keys.reduce(
    (result, key) => {
      if (key in obj) {
        result[key] = obj[key];
      }
      return result;
    },
    {} as Pick<T, K>,
  );

type SearchObject = Record<string, unknown>;

export function formatObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.keys(obj)
    .sort()
    .reduce(
      (result, key) => {
        const value = obj[key as keyof T];

        if (value !== undefined) {
          result[key as keyof T] = value;
        }

        return result;
      },
      {} as Partial<T>,
    );
}

export function isSearchEqual(a: SearchObject, b: SearchObject): boolean {
  const normalize = (obj: SearchObject) =>
    Object.entries(obj)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

  const normalizedA = normalize(a);
  const normalizedB = normalize(b);

  if (normalizedA.length !== normalizedB.length) {
    return false;
  }

  return normalizedA.every(([key, value], index) => {
    const [otherKey, otherValue] = normalizedB[index];
    return key === otherKey && Object.is(value, otherValue);
  });
}
