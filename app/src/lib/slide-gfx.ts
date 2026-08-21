/** PPTX / PDF 共通のスライド描画（座標はインチ） */

export type GfxLine = {
  color: string
  width: number
  dash?: boolean
  beginArrow?: boolean
  endArrow?: boolean
}

export type GfxTextRun = {
  text: string
  bold?: boolean
  fontSize?: number
  color?: string
  highlight?: string
  breakLine?: boolean
}

export type GfxTextOpts = {
  x: number
  y: number
  w: number
  h: number
  fontSize?: number
  bold?: boolean
  color?: string
  align?: "left" | "center" | "right"
  valign?: "top" | "middle" | "bottom"
  fill?: string
  highlight?: string
  margin?: number
}

export type SlideGfx = {
  addRect(opts: {
    x: number
    y: number
    w: number
    h: number
    fill?: string | null
    line?: GfxLine | null
  }): void
  addRoundRect(opts: {
    x: number
    y: number
    w: number
    h: number
    fill?: string | null
    line?: GfxLine | null
    rectRadius?: number
  }): void
  addEllipse(opts: {
    x: number
    y: number
    w: number
    h: number
    fill?: string | null
    line?: GfxLine | null
  }): void
  addDiamond(opts: {
    x: number
    y: number
    w: number
    h: number
    fill?: string | null
    line?: GfxLine | null
  }): void
  /** シリンダー（システム／DB ノード） */
  addCylinder(opts: {
    x: number
    y: number
    w: number
    h: number
    fill?: string | null
    line?: GfxLine | null
  }): void
  addLine(opts: {
    x: number
    y: number
    w: number
    h: number
    flipH?: boolean
    flipV?: boolean
    line: GfxLine
  }): void
  addText(text: string | GfxTextRun[], opts: GfxTextOpts): void
  addImage(opts: { data: string; x: number; y: number; w: number; h: number }): void
}
