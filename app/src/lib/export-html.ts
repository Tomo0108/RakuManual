import type { FlowState, ManualBlock, ManualSection, Project } from "@/lib/types"
import {
  buildManualOutline,
  displaySectionTitle,
  resolveLeafSectionNumber,
} from "@/lib/manual-outline"
import {
  formatMajorTitle,
  formatMediumHeading,
  resolveExportTheme,
  type ExportTheme,
} from "@/lib/export-theme"
import { resolveImageDataUrl } from "@/lib/resolve-export-image"
import { downloadHtmlFile } from "@/lib/api/export"

export interface ClientHtmlExportOptions {
  includeImages?: boolean
  includeFlow?: boolean
  template?: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function hex(c: string): string {
  return c.startsWith("#") ? c : `#${c}`
}

function noteText(raw: string): string {
  const t = raw.trim()
  return t.startsWith("※") ? t : `※${t}`
}

function sectionAnchor(id: string): string {
  return `sec-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

function majorAnchor(number: string): string {
  return `major-${number.replace(/[^0-9.]/g, "_")}`
}

function renderBodyBlocks(blocks: ManualBlock[]): string {
  let html = ""
  let stepNo = 0
  for (const block of blocks) {
    if (block.type === "note") {
      html += `<p class="note">${escapeHtml(noteText(block.text ?? ""))}</p>`
    } else if (block.type === "step") {
      stepNo += 1
      html += `<p class="step"><span class="step-mark">${stepNo}</span>${escapeHtml(`・${(block.text ?? "").trim()}`)}</p>`
    } else if ((block.text ?? "").trim()) {
      const t = block.text.trim()
      if (t.startsWith("（図の説明）")) {
        html += `<p class="caption">${escapeHtml(t)}</p>`
      } else {
        html += `<p class="para">${escapeHtml(t)}</p>`
      }
    }
  }
  return html
}

function flowHtml(flow: FlowState, theme: ExportTheme): string {
  const nodes = flow.nodes ?? []
  if (nodes.length === 0) return ""
  const lanes = (flow.lanes?.length ? flow.lanes : [...new Set(nodes.map((n) => n.data?.lane ?? ""))]).filter(
    Boolean,
  )
  const systems = flow.layoutMeta?.columnSystems ?? []

  const laneRows = lanes
    .map((lane) => {
      const items = nodes
        .filter((n) => (n.data?.lane ?? "") === lane)
        .map((n) => {
          const kind = n.data?.kind ?? "process"
          const num = n.data?.sectionNumber ? `<span class="fn">${escapeHtml(n.data.sectionNumber)}</span>` : ""
          const sys = n.data?.system ? `<span class="fs">${escapeHtml(n.data.system)}</span>` : ""
          return `<li class="fn-${escapeHtml(kind)}">${num}<span class="fl">${escapeHtml(n.data?.label ?? "")}</span>${sys}</li>`
        })
        .join("")
      return `<tr><th>${escapeHtml(lane)}</th><td><ol class="flow-steps">${items}</ol></td></tr>`
    })
    .join("")

  const sysLine =
    systems.filter((s) => s.label && s.label !== "—").length > 0
      ? `<p class="flow-systems">利用システム：${systems
          .filter((s) => s.label && s.label !== "—")
          .map((s) => {
            const label = escapeHtml(s.label)
            const href = s.url?.trim()
            return href
              ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
              : label
          })
          .join("　")}</p>`
      : ""

  return `<table class="flow-table" style="--accent:${hex(theme.accent)}"><tbody>${laneRows}</tbody></table>${sysLine}`
}

type TocNav = { href: string; label: string; indent: 0 | 1 | 2; major?: boolean }

function buildTocNav(
  outline: ReturnType<typeof buildManualOutline>,
  includeFlow: boolean,
  hasFlow: boolean,
): TocNav[] {
  const rows: TocNav[] = []
  if (includeFlow && hasFlow) {
    rows.push({ href: "#flow", label: "業務フロー図", indent: 0, major: true })
  }
  for (const major of outline) {
    rows.push({
      href: `#${majorAnchor(major.number)}`,
      label: formatMajorTitle(major.number, major.title),
      indent: 0,
      major: true,
    })
    for (const medium of major.mediums) {
      const first = medium.sections[0]
      const mediumLabel = `${medium.number}　${medium.title ?? (first ? displaySectionTitle(first) : "")}`
      rows.push({
        href: first ? `#${sectionAnchor(first.id)}` : `#${majorAnchor(major.number)}`,
        label: mediumLabel,
        indent: 1,
      })
      if (medium.sections.length > 1) {
        medium.sections.forEach((section, si) => {
          const leaf = resolveLeafSectionNumber(section, medium.number, si, medium.sections.length)
          rows.push({
            href: `#${sectionAnchor(section.id)}`,
            label: `${leaf}　${displaySectionTitle(section)}`,
            indent: 2,
          })
        })
      }
    }
  }
  return rows
}

function slideNav(prevId: string | null, nextId: string | null): string {
  const prev = prevId
    ? `<a class="nav-btn" href="#${prevId}">← 前へ</a>`
    : `<span class="nav-btn disabled">← 前へ</span>`
  const next = nextId
    ? `<a class="nav-btn" href="#${nextId}">次へ →</a>`
    : `<span class="nav-btn disabled">次へ →</span>`
  return `<nav class="slide-nav" aria-label="スライド移動">${prev}<a class="nav-btn toc" href="#toc">目次</a>${next}</nav>`
}

function chromeOpen(opts: {
  id: string
  title: string
  chip?: string
  pageNum: number
  kind?: string
}): string {
  const chip = opts.chip
    ? `<span class="chip">${escapeHtml(opts.chip)}</span>`
    : ""
  return `<article class="slide ${opts.kind ?? ""}" id="${escapeHtml(opts.id)}" data-page="${opts.pageNum}">
  <div class="bar"></div>
  <header class="chrome">
    <h2 class="chrome-title">${escapeHtml(opts.title)}</h2>
    ${chip}
  </header>
  <div class="rule"></div>
  <div class="frame">`
}

function chromeClose(pageNum: number, prev: string | null, next: string | null): string {
  return `</div>
  <div class="page-num">${pageNum}</div>
  ${slideNav(prev, next)}
</article>`
}

/**
 * PowerPoint と同じ項番・表紙・目次リンク・スライド枠で HTML を生成する。
 */
export async function exportManualHtml(
  project: Project,
  sections: ManualSection[],
  options: ClientHtmlExportOptions = {},
): Promise<{ imageFailures: number }> {
  const includeImages = options.includeImages !== false
  const includeFlow = options.includeFlow !== false
  const theme = resolveExportTheme(options.template)
  const outline = buildManualOutline(sections, { defaultMajorTitle: project.name })
  const hasFlow = Boolean(project.flow?.nodes?.length)
  const tocNav = buildTocNav(outline, includeFlow, hasFlow)

  const imageCache = new Map<string, string | null>()
  let imageFailures = 0
  const resolveImg = async (url: string): Promise<string | null> => {
    if (imageCache.has(url)) return imageCache.get(url) ?? null
    const data = await resolveImageDataUrl(url)
    imageCache.set(url, data)
    if (!data) imageFailures += 1
    return data
  }

  type Slide = { id: string; html: string }
  const slides: Slide[] = []

  slides.push({
    id: "cover",
    html: `<article class="slide cover" id="cover" data-page="1">
  <div class="cover-inner">
    <h1>${escapeHtml(project.name)}</h1>
    <p>業務マニュアル</p>
  </div>
  ${slideNav(null, includeFlow && hasFlow ? "flow" : "toc")}
</article>`,
  })

  if (includeFlow && hasFlow) {
    slides.push({
      id: "flow",
      html: `${chromeOpen({ id: "flow", title: "業務フロー図", pageNum: 2 })}
${flowHtml(project.flow, theme)}
${chromeClose(2, "cover", "toc")}`,
    })
  }

  const tocSlideHtml = tocNav
    .map((row) => {
      const cls = `toc-row indent-${row.indent}${row.major ? " major" : ""}`
      return `<a class="${cls}" href="${escapeHtml(row.href)}">${escapeHtml(row.label)}</a>`
    })
    .join("")

  slides.push({
    id: "toc",
    html: "", // filled after page numbers known
  })

  const procedureSlides: Slide[] = []
  for (const major of outline) {
    const mId = majorAnchor(major.number)
        procedureSlides.push({
          id: mId,
          html: `<article class="slide divider" id="${mId}" data-page="0">
  <p class="divider-title">${escapeHtml(formatMajorTitle(major.number, major.title))}</p>
  <div class="page-num">0</div>
  ${slideNav(null, null)}
</article>`,
        })

    for (const medium of major.mediums) {
      for (let si = 0; si < medium.sections.length; si++) {
        const section = medium.sections[si]!
        const title = displaySectionTitle(section)
        const num = resolveLeafSectionNumber(section, medium.number, si, medium.sections.length)
        const headingTitle =
          medium.sections.length === 1 && medium.title?.trim() ? medium.title.trim() : title
        const headingNum = medium.sections.length === 1 ? medium.number : num
        const chip = major.title ? `【${major.title}】` : undefined
        const chromeTitle = formatMajorTitle(major.number, major.title ?? project.name)
        const sid = sectionAnchor(section.id)

        const imageEntries: { url: string; caption?: string }[] = includeImages
          ? section.blocks.flatMap((b) => {
              const url = b.image?.url
              if (!url) return []
              return [{ url, caption: b.image?.caption?.trim() || undefined }]
            })
          : []

        const heading = formatMediumHeading(headingNum, headingTitle)
        let blocks = [...section.blocks]
        if (imageEntries[0]?.caption) {
          blocks = [
            ...blocks,
            {
              id: `cap-${section.id}`,
              type: "paragraph",
              text: `（図の説明）${imageEntries[0].caption}`,
            },
          ]
        }

        let figures = ""
        for (const entry of imageEntries) {
          const data = await resolveImg(entry.url)
          if (!data) {
            figures += `<p class="img-missing">（画像を埋め込めませんでした）</p>`
            continue
          }
          const alt = escapeHtml(entry.caption || "手順の参考画像")
          figures += `<figure><img src="${data}" alt="${alt}" /></figure>`
        }

        procedureSlides.push({
          id: sid,
          html: `${chromeOpen({
            id: sid,
            title: chromeTitle.length > 40 ? `${chromeTitle.slice(0, 40)}…` : chromeTitle,
            chip,
            pageNum: 0,
          })}
<p class="medium-heading">${escapeHtml(heading)}</p>
${renderBodyBlocks(blocks)}
${figures}
${chromeClose(0, null, null)}`,
        })
      }
    }
  }

  const allIds = [
    "cover",
    ...(includeFlow && hasFlow ? ["flow"] : []),
    "toc",
    ...procedureSlides.map((s) => s.id),
  ]

  const withNav = (id: string, innerWithoutNav: string, pageNum: number): string => {
    const idx = allIds.indexOf(id)
    const prev = idx > 0 ? allIds[idx - 1]! : null
    const next = idx >= 0 && idx < allIds.length - 1 ? allIds[idx + 1]! : null
    return innerWithoutNav
      .replace(/data-page="0"/, `data-page="${pageNum}"`)
      .replace(/<div class="page-num">0<\/div>/, `<div class="page-num">${pageNum}</div>`)
      .replace(
        `${slideNav(null, null)}`,
        slideNav(prev, next),
      )
  }

  const tocIndex = allIds.indexOf("toc")
  const tocPage = tocIndex + 1
  slides[slides.findIndex((s) => s.id === "toc")] = {
    id: "toc",
    html: `${chromeOpen({ id: "toc", title: "目次", pageNum: tocPage })}
<div class="toc-grid">${tocSlideHtml}</div>
${chromeClose(
  tocPage,
  tocIndex > 0 ? allIds[tocIndex - 1]! : null,
  tocIndex < allIds.length - 1 ? allIds[tocIndex + 1]! : null,
)}`,
  }

  procedureSlides.forEach((s, i) => {
    const pageNum = tocPage + 1 + i
    slides.push({
      id: s.id,
      html: withNav(s.id, s.html, pageNum),
    })
  })

  const sidebar = tocNav
    .map((row) => {
      const cls = `side-link indent-${row.indent}${row.major ? " major" : ""}`
      return `<a class="${cls}" href="${escapeHtml(row.href)}">${escapeHtml(row.label)}</a>`
    })
    .join("")

  const navy = hex(theme.navy)
  const accent = hex(theme.accent)
  const frame = hex(theme.frame)
  const chipBg = hex(theme.chipBg)
  const chipFg = hex(theme.chipFg)
  const coverBg = hex(theme.coverBg)
  const text = hex(theme.text)

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(project.name)}</title>
  <style>
    :root {
      --navy: ${navy};
      --accent: ${accent};
      --frame: ${frame};
      --chip-bg: ${chipBg};
      --chip-fg: ${chipFg};
      --cover: ${coverBg};
      --text: ${text};
      --link: #0563c1;
      --side-w: 280px;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: Meiryo, "Meiryo UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
      color: var(--text);
      background: #e8eef3;
    }
    .layout { display: flex; min-height: 100vh; }
    .sidebar {
      position: sticky; top: 0; align-self: flex-start;
      width: var(--side-w); height: 100vh; overflow: auto;
      background: #fff; border-right: 1px solid #d5dde5;
      padding: 16px 12px 32px;
    }
    .sidebar h1 { font-size: 13px; margin: 0 0 4px; color: var(--navy); }
    .sidebar .hint { font-size: 11px; color: #666; margin: 0 0 12px; }
    .side-link {
      display: block; color: var(--link); text-decoration: none;
      font-size: 12px; line-height: 1.45; padding: 4px 8px; border-radius: 4px;
    }
    .side-link.major { color: var(--navy); font-weight: 700; font-size: 13px; margin-top: 8px; }
    .side-link.indent-1 { padding-left: 16px; }
    .side-link.indent-2 { padding-left: 28px; font-size: 11px; }
    .side-link:hover, .side-link:focus-visible { background: #eef4fb; outline: none; }
    .side-link.active { background: #e8f1fb; box-shadow: inset 3px 0 0 var(--accent); }
    .deck { flex: 1; padding: 24px 20px 64px; max-width: 1100px; }
    .slide {
      position: relative;
      background: #fff;
      margin: 0 0 28px;
      padding: 0 18px 48px;
      border-radius: 4px;
      box-shadow: 0 8px 24px rgba(5, 55, 102, 0.08);
      scroll-margin-top: 12px;
    }
    .slide.cover {
      min-height: 420px;
      background: var(--cover);
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      padding: 48px 24px 72px;
    }
    .cover-inner { text-align: center; color: #fff; }
    .cover-inner h1 { font-size: 36px; margin: 0 0 16px; }
    .cover-inner p { font-size: 18px; margin: 0; opacity: 0.95; }
    .slide.cover .slide-nav a, .slide.cover .slide-nav span { background: rgba(255,255,255,.18); color: #fff; border-color: rgba(255,255,255,.35); }
    .slide.divider {
      min-height: 280px; display: flex; flex-direction: column; justify-content: center; align-items: center;
      padding-bottom: 64px;
    }
    .divider-title { font-size: 32px; font-weight: 700; color: var(--frame); text-align: center; margin: 0 24px; }
    .bar { height: 10px; background: var(--navy); margin: 0 -18px; border-radius: 4px 4px 0 0; }
    .chrome { display: flex; align-items: center; gap: 12px; padding: 14px 4px 8px; }
    .chrome-title { flex: 1; font-size: 20px; font-weight: 700; margin: 0; color: var(--text); }
    .chip {
      flex-shrink: 0; background: var(--chip-bg); color: var(--chip-fg);
      font-size: 14px; font-weight: 700; border-radius: 6px; padding: 6px 14px;
    }
    .rule { height: 2px; background: var(--accent); margin: 0 4px 10px; }
    .frame {
      border: 2.25px solid var(--frame); border-radius: 10px;
      min-height: 280px; padding: 18px 20px 24px; margin: 0 4px;
    }
    .page-num { position: absolute; right: 22px; bottom: 14px; font-size: 11px; color: #444; }
    .medium-heading { font-size: 16px; font-weight: 700; margin: 0 0 12px; }
    .para, .step { font-size: 16px; line-height: 1.7; margin: 0 0 10px; }
    .step { display: flex; gap: 6px; }
    .step-mark { display: none; }
    .note {
      font-size: 16px; font-weight: 700; margin: 0 0 10px;
      background: #ffff00; display: inline-block; padding: 2px 4px;
    }
    .caption { font-size: 16px; margin: 0 0 12px; }
    figure { margin: 16px 0 0; text-align: center; }
    figure img {
      display: block; margin: 0 auto; max-width: 100%; max-height: 52vh;
      width: auto; height: auto; object-fit: contain;
      border: 1px solid #ddd; border-radius: 4px;
    }
    .img-missing { color: #b45309; font-size: 14px; }
    .toc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 32px; }
    .toc-row {
      display: block; text-decoration: none; color: var(--link);
      font-size: 14px; line-height: 1.6; padding: 2px 0;
    }
    .toc-row.major { color: var(--navy); font-weight: 700; font-size: 16px; margin-top: 6px; }
    .toc-row.indent-1 { padding-left: 18px; font-size: 14px; }
    .toc-row.indent-2 { padding-left: 36px; font-size: 13px; }
    .toc-row:hover { text-decoration: underline; }
    .flow-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .flow-table th {
      width: 7.5em; text-align: right; padding: 8px 12px; vertical-align: top;
      background: #f3f6f9; color: var(--navy); border-bottom: 1px solid #dde;
    }
    .flow-table td { padding: 8px 12px; border-bottom: 1px solid #dde; }
    .flow-steps { margin: 0; padding-left: 1.2em; }
    .flow-steps li { margin: 0 0 6px; }
    .fn { display: inline-block; min-width: 2.4em; font-weight: 700; color: var(--accent); margin-right: 6px; }
    .fs { display: block; font-size: 12px; color: #666; }
    .flow-systems { font-size: 13px; color: #444; margin: 12px 0 0; }
    .flow-systems a { color: var(--link); }
    .slide-nav {
      position: absolute; left: 18px; right: 70px; bottom: 10px;
      display: flex; gap: 8px; align-items: center;
    }
    .nav-btn {
      font-size: 12px; text-decoration: none; color: var(--navy);
      border: 1px solid #c5d0da; background: #f7fafc; border-radius: 4px; padding: 4px 10px;
    }
    .nav-btn.toc { margin-left: auto; }
    .nav-btn:hover { background: #eef4fb; }
    .nav-btn.disabled { opacity: 0.4; pointer-events: none; }
    @media (max-width: 900px) {
      .layout { display: block; }
      .sidebar { position: relative; width: auto; height: auto; max-height: 40vh; }
      .toc-grid { grid-template-columns: 1fr; }
    }
    @media print {
      body { background: #fff; }
      .sidebar, .slide-nav { display: none !important; }
      .deck { padding: 0; max-width: none; }
      .slide { box-shadow: none; margin: 0; page-break-after: always; break-after: page; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar" aria-label="目次">
      <h1>${escapeHtml(project.name)}</h1>
      <p class="hint">クリックで該当箇所へ移動 · ←→ キーでも移動できます</p>
      <a class="side-link major" href="#cover">表紙</a>
      ${sidebar}
    </aside>
    <main class="deck">
      ${slides.map((s) => s.html).join("\n")}
    </main>
  </div>
  <script>
    (function () {
      var ids = ${JSON.stringify(allIds)};
      var links = Array.prototype.slice.call(document.querySelectorAll(".side-link"));
      function currentIndex() {
        var h = (location.hash || "#cover").slice(1);
        var i = ids.indexOf(h);
        return i < 0 ? 0 : i;
      }
      function go(delta) {
        var next = Math.max(0, Math.min(ids.length - 1, currentIndex() + delta));
        location.hash = ids[next];
      }
      document.addEventListener("keydown", function (e) {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.key === "ArrowRight" || e.key === " " || e.key === "j") { e.preventDefault(); go(1); }
        if (e.key === "ArrowLeft" || e.key === "k") { e.preventDefault(); go(-1); }
        if (e.key === "Home") { e.preventDefault(); location.hash = "cover"; }
        if (e.key === "End") { e.preventDefault(); location.hash = ids[ids.length - 1]; }
      });
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var id = en.target.id;
          links.forEach(function (a) {
            var href = a.getAttribute("href") || "";
            a.classList.toggle("active", href === "#" + id);
          });
        });
      }, { rootMargin: "-20% 0px -60% 0px", threshold: 0.2 });
      document.querySelectorAll(".slide[id]").forEach(function (el) { observer.observe(el); });
    })();
  </script>
</body>
</html>`

  downloadHtmlFile(html, `${project.name}.html`)
  return { imageFailures }
}
