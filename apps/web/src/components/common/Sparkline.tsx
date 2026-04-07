import React, { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
}

export function Sparkline({ data, color = '#2563eb', height = 32, className }: SparklineProps) {
  const chartData = useMemo(() => data.map((value, i) => ({ i, value })), [data]);

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.15} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-fill-${color.replace('#', '')})`}
            dot={false}
            isAnimationActive={true}
            animationDuration={800}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
