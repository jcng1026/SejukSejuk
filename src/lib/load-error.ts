/**
 * For server queries feeding a page: a failed read throws, so the route's error
 * boundary shows it. (Server Actions return a Failure via `fail` in result.ts instead.)
 */
export function throwLoadError(what: string, message: string): never {
  throw new Error(`Could not load ${what}: ${message}`);
}
