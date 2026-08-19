import { useEffect, useState } from "react"
import { Dithering, Warp } from "@paper-design/shaders-react"

// Cap shader resolution — default is ~4K@2x which is brutal with two layers.
const MAX_PIXEL_COUNT = 1280 * 720

export function LandingHeroBackground() {
  const [size, setSize] = useState({ width: 1280, height: 720 })
  const [mounted, setMounted] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const update = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  useEffect(() => {
    setMounted(true)
    setReduceMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
  }, [])

  const shadersEnabled = mounted && !reduceMotion

  return (
    <div className="absolute inset-0">
      <img
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        src="/landing/hero-bg.png"
      />

      {shadersEnabled ? (
        <>
          <Dithering
            className="absolute inset-0 opacity-35 mix-blend-soft-light"
            width={size.width}
            height={size.height}
            fit="cover"
            minPixelRatio={1}
            maxPixelCount={MAX_PIXEL_COUNT}
            colorBack="#030f14"
            colorFront="#0d4a52"
            shape="warp"
            type="4x4"
            size={2.5}
            speed={0.6}
          />
          <Warp
            className="absolute inset-0 opacity-45 mix-blend-screen"
            width={size.width}
            height={size.height}
            fit="cover"
            minPixelRatio={1}
            maxPixelCount={MAX_PIXEL_COUNT}
            colors={["#030f14", "#05e3d6", "#3082fa"]}
            proportion={0.28}
            softness={1.1}
            distortion={0.24}
            swirl={0.52}
            swirlIterations={10}
            shape="edge"
            shapeScale={0.72}
            speed={2.4}
            scale={2}
          />
        </>
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-b from-[#030f14]/20 via-transparent to-[#030f14]/90" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_15%,transparent_0%,#030f14_70%)]" />
    </div>
  )
}
