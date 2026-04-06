export const CHART_COLOR_TOKENS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export function getChartTokenColor(index: number) {
  return CHART_COLOR_TOKENS[index % CHART_COLOR_TOKENS.length];
}

export function withChartTokenColors<T extends Record<string, unknown>>(
  data: T[],
  colorKey: string = "color"
): Array<T & { [key: string]: string }> {
  return data.map((entry, index) => ({
    ...entry,
    [colorKey]: getChartTokenColor(index),
  }));
}
