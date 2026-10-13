/**
 * Server-side chart render (spec §2): ECharts SSR → SVG string → PNG via resvg.
 * Same ECharts option as the screen, so deck and screen match pixel-for-pixel.
 *
 * Imports are done lazily so this package stays importable in environments
 * without the native resvg binary (e.g. typecheck on CI without install).
 */
export interface SsrRenderOptions {
  width: number;
  height: number;
  devicePixelRatio?: number;
}

/** Render an ECharts option object to an SVG string (no DOM). */
export async function optionToSvg(
  option: unknown,
  opts: SsrRenderOptions,
): Promise<string> {
  const echarts = await import('echarts');
  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: opts.width,
    height: opts.height,
  });
  chart.setOption(option as Parameters<typeof chart.setOption>[0]);
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}

/** Rasterise an SVG string to PNG bytes. */
export async function svgToPng(svg: string, width: number): Promise<Buffer> {
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    // TODO: bundle fonts (spec §2) for deterministic text rendering.
  });
  return Buffer.from(resvg.render().asPng());
}

export async function optionToPng(option: unknown, opts: SsrRenderOptions): Promise<Buffer> {
  const svg = await optionToSvg(option, opts);
  return svgToPng(svg, opts.width * (opts.devicePixelRatio ?? 2));
}
