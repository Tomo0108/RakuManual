/** ロックボタンをシェイク（Tailwind アニメーション競合を避け WAAPI を使用） */
export function vibrateLockButtonElement(el: HTMLElement | null): void {
  if (!el || typeof el.animate !== "function") return

  el.getAnimations().forEach((anim) => anim.cancel())
  el.animate(
    [
      { transform: "translate3d(0, 0, 0) rotate(0deg)" },
      { transform: "translate3d(-5px, 0, 0) rotate(-6deg)" },
      { transform: "translate3d(5px, 0, 0) rotate(6deg)" },
      { transform: "translate3d(-4px, 1px, 0) rotate(-5deg)" },
      { transform: "translate3d(4px, -1px, 0) rotate(5deg)" },
      { transform: "translate3d(-2px, 0, 0) rotate(-3deg)" },
      { transform: "translate3d(2px, 0, 0) rotate(3deg)" },
      { transform: "translate3d(0, 0, 0) rotate(0deg)" },
    ],
    { duration: 520, easing: "ease-in-out" },
  )
}
