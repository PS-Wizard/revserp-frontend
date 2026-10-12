import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"

import detectorManifest from "../app/content/handbook/detector-manifest.json"

const backendDirectory = resolve(process.argv[2] ?? "../revserp-backend")
const currentManifest = JSON.parse(
  execFileSync("go", ["run", "./cmd/handbook-catalog"], {
    cwd: backendDirectory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
)

assert.deepEqual(
  currentManifest,
  detectorManifest,
  "Handbook detector manifest is stale. Regenerate it with the backend handbook-catalog command, then update the affected guides."
)

console.log("Handbook detector manifest matches the backend.")
