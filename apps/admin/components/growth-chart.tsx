"use client";

import type { DashboardSeriesPoint } from "@petto/contracts";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type GrowthTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ dataKey?: string; value?: number | string }>;
};

const SERIES = [
  {
    key: "users" as const,
    label: "New users",
    color: "#E6694A",
    gradient: "growth-users-gradient"
  },
  {
    key: "activeUsers" as const,
    label: "Active users",
    color: "#21433C",
    gradient: "growth-active-gradient"
  }
];

export function GrowthChart({
  data,
  liveCount
}: {
  data: DashboardSeriesPoint[];
  liveCount?: number;
}) {
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const totals = SERIES.map((s) => {
    const today = last ? Number(last[s.key] ?? 0) : 0;
    const yesterday = prev ? Number(prev[s.key] ?? 0) : 0;
    const delta = today - yesterday;
    return { ...s, today, delta };
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {totals.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {s.label}
              </span>
              <span className="text-sm font-semibold text-[var(--foreground)]">
                {s.today.toLocaleString()}
              </span>
              <DeltaChip delta={s.delta} />
            </div>
          ))}
        </div>
        {typeof liveCount === "number" ? (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--success)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
            </span>
            Live · {liveCount}
          </div>
        ) : null}
      </div>

      <div className="relative h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="growth-users-gradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#E6694A" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#E6694A" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="growth-active-gradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#21433C" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#21433C" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="label"
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              width={36}
              allowDecimals={false}
            />
            <Tooltip content={<GrowthTooltip />} cursor={{ stroke: "rgba(15,23,42,0.12)" }} />
            {SERIES.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                fill={`url(#${s.gradient})`}
                strokeWidth={2.5}
              />
            ))}
            {last
              ? SERIES.map((s) => (
                  <ReferenceDot
                    key={`${s.key}-pulse`}
                    x={last.label}
                    y={Number(last[s.key] ?? 0)}
                    r={4}
                    fill={s.color}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    className="growth-pulse-dot"
                  />
                ))
              : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DeltaChip({ delta }: { delta: number }) {
  if (!delta) {
    return (
      <span className="rounded-sm bg-[var(--muted)] px-1 py-px text-[10px] font-medium text-[var(--muted-foreground)]">
        ·
      </span>
    );
  }
  const tone = delta > 0 ? "text-[var(--success)] bg-[var(--success-soft)]" : "text-[var(--destructive)] bg-[var(--destructive-soft)]";
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`rounded-sm px-1 py-px text-[10px] font-semibold ${tone}`}>
      {sign}
      {delta}
    </span>
  );
}

function GrowthTooltip({ active, payload, label }: GrowthTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-2 shadow-sm">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="flex flex-col gap-1">
        {SERIES.map((s) => {
          const entry = payload.find((p) => p.dataKey === s.key);
          const value = Number(entry?.value ?? 0);
          return (
            <div key={s.key} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-[var(--muted-foreground)]">{s.label}</span>
              <span className="ml-auto font-semibold text-[var(--foreground)]">
                {value.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
