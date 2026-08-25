import { Injectable } from "@nestjs/common";

/**
 * Prometheus 文本格式的进程内计数器和直方图。不加 prom-client。
 */

/** HTTP / 外部调用耗时桶（秒）。 */
export const DURATION_BUCKETS_SECONDS = [
  0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300,
] as const;

type LabelSet = Record<string, string>;

interface CounterSeries {
  name: string;
  help: string;
  labels: LabelSet;
  value: number;
}

interface HistogramSeries {
  name: string;
  help: string;
  labels: LabelSet;
  buckets: number[];
  inf: number;
  sum: number;
  count: number;
}

function labelKey(labels: LabelSet): string {
  return Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key]}`)
    .join(",");
}

function seriesKey(name: string, labels: LabelSet): string {
  return `${name}|${labelKey(labels)}`;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function formatLabels(labels: LabelSet): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  const inner = keys.map((key) => `${key}="${escapeLabel(labels[key])}"`).join(",");
  return `{${inner}}`;
}

/**
 * 进程内指标登记。三个 HTTP 服务共用同一套渲染格式。
 */
@Injectable()
export class MetricsRegistry {
  private readonly counters = new Map<string, CounterSeries>();
  private readonly histograms = new Map<string, HistogramSeries>();
  private readonly counterMeta = new Map<string, string>();
  private readonly histogramMeta = new Map<string, string>();

  /**
   * 累加计数器。
   * @param name Prometheus 指标名
   * @param help HELP 行
   * @param labels 标签
   * @param value 增量，默认 1
   */
  inc(name: string, help: string, labels: LabelSet, value = 1): void {
    this.counterMeta.set(name, help);
    const key = seriesKey(name, labels);
    const existing = this.counters.get(key);
    if (existing) {
      existing.value += value;
      return;
    }
    this.counters.set(key, { name, help, labels, value });
  }

  /**
   * 观察直方图（秒）。
   * @param name Prometheus 指标名
   * @param help HELP 行
   * @param labels 标签
   * @param seconds 耗时秒数
   */
  observe(name: string, help: string, labels: LabelSet, seconds: number): void {
    this.histogramMeta.set(name, help);
    const key = seriesKey(name, labels);
    let series = this.histograms.get(key);
    if (!series) {
      series = {
        name,
        help,
        labels,
        buckets: DURATION_BUCKETS_SECONDS.map(() => 0),
        inf: 0,
        sum: 0,
        count: 0,
      };
      this.histograms.set(key, series);
    }
    series.count += 1;
    series.sum += seconds;
    series.inf += 1;
    for (let i = 0; i < DURATION_BUCKETS_SECONDS.length; i += 1) {
      if (seconds <= DURATION_BUCKETS_SECONDS[i]) {
        series.buckets[i] += 1;
      }
    }
  }

  /**
   * 渲染 Prometheus 0.0.4 文本。
   * @example
   * `inc("calls_total", "calls", { ok: "true" }, 2)` 再 `render()`
   * → 含 `calls_total{ok="true"} 2` 的文本
   */
  render(): string {
    const lines: string[] = [];

    for (const [name, help] of this.counterMeta) {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} counter`);
      for (const series of this.counters.values()) {
        if (series.name !== name) continue;
        lines.push(`${name}${formatLabels(series.labels)} ${series.value}`);
      }
    }

    for (const [name, help] of this.histogramMeta) {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} histogram`);
      for (const series of this.histograms.values()) {
        if (series.name !== name) continue;
        const base = formatLabels(series.labels);
        const join = (extra: string) =>
          base ? `{${base.slice(1, -1)},${extra}}` : `{${extra}}`;
        for (let i = 0; i < DURATION_BUCKETS_SECONDS.length; i += 1) {
          lines.push(
            `${name}_bucket${join(`le="${DURATION_BUCKETS_SECONDS[i]}"`)} ${series.buckets[i]}`,
          );
        }
        lines.push(`${name}_bucket${join('le="+Inf"')} ${series.inf}`);
        lines.push(`${name}_sum${base} ${series.sum}`);
        lines.push(`${name}_count${base} ${series.count}`);
      }
    }

    return `${lines.join("\n")}\n`;
  }
}
