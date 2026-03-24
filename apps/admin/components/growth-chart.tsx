"use client";

import type { DashboardSeriesPoint } from "@petto/contracts";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function GrowthChart({ data }: { data: DashboardSeriesPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="usersGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#E6694A" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#E6694A" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="matchesGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#21433C" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#21433C" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(22,21,20,0.08)" vertical={false} />
          <XAxis axisLine={false} dataKey="label" tickLine={false} />
          <YAxis axisLine={false} tickLine={false} />
          <Tooltip />
          <Area dataKey="users" stroke="#E6694A" fill="url(#usersGradient)" strokeWidth={2.5} />
          <Area dataKey="matches" stroke="#21433C" fill="url(#matchesGradient)" strokeWidth={2.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

