import { useEffect, useId, useRef } from "react"
import mermaid from "mermaid"

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  securityLevel: "loose",
  fontFamily: "Geist Variable, sans-serif",
})

type MermaidDiagramProps = {
  chart: string
  caption?: string
}

export function MermaidDiagram({ chart, caption }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const id = useId().replace(/:/g, "")

  useEffect(() => {
    const render = async () => {
      if (!containerRef.current) return
      try {
        const { svg } = await mermaid.render(`mermaid-${id}`, chart)
        containerRef.current.innerHTML = svg
      } catch {
        containerRef.current.innerHTML =
          '<p class="text-sm text-muted-foreground">図の描画に失敗しました</p>'
      }
    }
    void render()
  }, [chart, id])

  return (
    <figure className="my-6 overflow-x-auto rounded-lg border bg-muted/30 p-6">
      <div ref={containerRef} className="flex justify-center [&>svg]:max-w-full" />
      {caption && (
        <figcaption className="mt-4 text-center text-sm text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
