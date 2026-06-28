import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), reactRouter()],
  // Pre-bundle the (large, dynamically-imported) charting libs at startup so
  // Vite doesn't discover them mid-session and trigger a re-optimize, which
  // can serve corrupted/empty dep modules to an already-loaded page.
  optimizeDeps: { include: ["recharts", "apexcharts"] },
})
