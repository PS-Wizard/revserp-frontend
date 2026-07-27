import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), reactRouter()],
  // Pre-bundle the (large, dynamically-imported) charting libs at startup so
  // Vite doesn't discover them mid-session and trigger a re-optimize, which
  // can serve corrupted/empty dep modules to an already-loaded page.
  // The root-layout deps are here for the same reason: discovering them late
  // re-optimizes React itself, and the second copy makes TooltipProvider throw
  // "Invalid hook call" on hydration, which kills the whole client tree.
  optimizeDeps: {
    include: [
      "recharts",
      "apexcharts",
      "react",
      "react-dom",
      "react-dom/client",
      "@base-ui/react/tooltip",
      "@tanstack/react-query",
      "lucide-react",
      "sonner",
      "clsx",
      "tailwind-merge",
    ],
  },
})
