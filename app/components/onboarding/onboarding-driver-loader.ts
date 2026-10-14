/** Swappable Driver.js module loader. Tests inject an observing module here
 * instead of mock.module("driver.js"), which leaks across test files in bun's
 * shared module registry and breaks parallel suite runs. */
type DriverModule = typeof import("driver.js")

type DriverLoader = () => Promise<DriverModule>

const realLoader: DriverLoader = () => import("driver.js")

let loader: DriverLoader = realLoader

/** Test-only override; pass null (or call in afterEach) to restore. */
export function setOnboardingDriverLoader(next: DriverLoader | null) {
  loader = next ?? realLoader
}

/** Resolve the driver factory for the tour controller. */
export function loadOnboardingDriver(): Promise<DriverModule["driver"]> {
  return loader().then((module) => module.driver)
}
