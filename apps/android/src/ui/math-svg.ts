import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js'
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js'

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)

export interface MathSvg { xml: string; width: number; height: number }

/** Local TeX → paths only. No HTML, URL, extension loader or shared user macros. */
export function renderMathSvg(source: string, display: boolean): MathSvg | undefined {
  if (source.length > 4096) return undefined
  try {
    const tex = new TeX({ packages: ['base', 'ams'], maxBuffer: 4096, maxMacros: 256 })
    const document = mathjax.document('', { InputJax: tex, OutputJax: new SVG({ fontCache: 'none' }) })
    const node = document.convert(source, { display })
    const xml = adaptor.outerHTML(node)
    if (xml.includes('data-mjx-error') || xml.includes('<text')) return undefined
    const svg = xml.slice(xml.indexOf('<svg'), xml.lastIndexOf('</svg>') + 6)
    const viewBox = /viewBox="([^"]+)"/u.exec(svg)?.[1]?.split(/\s+/u).map(Number)
    if (!viewBox || viewBox.length !== 4) return undefined
    // MathJax's path coordinates use 1000 units per em.
    const width = viewBox[2]! / 1000
    const height = viewBox[3]! / 1000
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 200 || height > 100) return undefined
    return { xml: svg, width, height }
  } catch {
    return undefined
  }
}
