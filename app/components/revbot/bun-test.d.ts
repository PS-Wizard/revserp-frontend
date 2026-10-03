// Minimal ambient types for `bun test` (the repo has no test framework and no
// bun-types dependency). Only the assertions used by colocated unit tests.
declare module "bun:test" {
  export function describe(name: string, fn: () => void): void
  export function test(name: string, fn: () => void | Promise<void>): void
  export function beforeEach(fn: () => void | Promise<void>): void
  export function afterEach(fn: () => void | Promise<void>): void
  export function expect(value: unknown): {
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toStrictEqual(expected: unknown): void
    toBeNull(): void
    toBeUndefined(): void
    toBeTruthy(): void
    toBeFalsy(): void
    toHaveLength(expected: number): void
    toContain(expected: unknown): void
  }
}
