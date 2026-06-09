import React from 'react';
import { useWindowDimensions, View, Text } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

interface Point { date: string; nibut: number }

const PAD = { top: 12, right: 12, bottom: 36, left: 38 };

export function TrendChart({
  data,
  normal = 10,
  borderline = 5,
}: {
  data: Point[];
  normal?: number;
  borderline?: number;
}) {
  const { width } = useWindowDimensions();
  const W = width - 64;
  const H = 160;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  if (data.length === 0) {
    return (
      <View className="h-24 items-center justify-center">
        <Text className="text-sm text-slate-600">No trend data yet.</Text>
      </View>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.nibut), normal + 3);
  const toY = (val: number) => PAD.top + innerH - (val / maxVal) * innerH;
  const toX = (i: number) =>
    PAD.left + (data.length < 2 ? innerW / 2 : (i / (data.length - 1)) * innerW);

  const polyPoints = data.map((d, i) => `${toX(i)},${toY(d.nibut)}`).join(' ');

  return (
    <Svg width={W} height={H}>
      {/* Normal threshold reference line */}
      <Line
        x1={PAD.left} x2={W - PAD.right}
        y1={toY(normal)} y2={toY(normal)}
        stroke="#4ADE80" strokeWidth={1} strokeDasharray="4 3"
      />
      <SvgText x={PAD.left - 4} y={toY(normal) + 4} fontSize={9} fill="#475569" textAnchor="end">
        {normal}s
      </SvgText>

      {/* Borderline threshold reference line */}
      <Line
        x1={PAD.left} x2={W - PAD.right}
        y1={toY(borderline)} y2={toY(borderline)}
        stroke="#FBBF24" strokeWidth={1} strokeDasharray="4 3"
      />
      <SvgText x={PAD.left - 4} y={toY(borderline) + 4} fontSize={9} fill="#475569" textAnchor="end">
        {borderline}s
      </SvgText>

      {/* Data line */}
      {data.length > 1 && (
        <Polyline points={polyPoints} fill="none" stroke="#0E7C7B" strokeWidth={2} />
      )}

      {/* Data points + x labels */}
      {data.map((d, i) => (
        <React.Fragment key={i}>
          <Circle cx={toX(i)} cy={toY(d.nibut)} r={3} fill="#0E7C7B" />
          {(i === 0 || i === data.length - 1) && (
            <SvgText
              x={toX(i)} y={H - PAD.bottom + 14}
              fontSize={9} fill="#475569" textAnchor="middle"
            >
              {d.date.slice(0, 5)}
            </SvgText>
          )}
        </React.Fragment>
      ))}
    </Svg>
  );
}
