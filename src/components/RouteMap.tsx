import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme';
import type { Place } from '../types';

/** Desenho da rota do dia, sem mapa de fundo: funciona offline e sem chave de API. */
export const RouteMap = ({ stops, height = 170 }: { stops: Place[]; height?: number }) => {
  const [width, setWidth] = useState(0);
  const pad = 28;
  let points: { x: number; y: number }[] = [];
  if (width > 0 && stops.length > 0) {
    const lats = stops.map((p) => p.lat);
    const lngs = stops.map((p) => p.lng);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    // corrige a longitude pela latitude para manter as proporções
    const kx = Math.cos((midLat * Math.PI) / 180);
    const minX = Math.min(...lngs) * kx;
    const maxX = Math.max(...lngs) * kx;
    const minY = Math.min(...lats);
    const maxY = Math.max(...lats);
    const spanX = Math.max(maxX - minX, 1e-6);
    const spanY = Math.max(maxY - minY, 1e-6);
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const offX = (width - spanX * scale) / 2;
    const offY = (height - spanY * scale) / 2;
    points = stops.map((p) => ({
      x: stops.length === 1 ? width / 2 : offX + (p.lng * kx - minX) * scale,
      y: stops.length === 1 ? height / 2 : height - (offY + (p.lat - minY) * scale),
    }));
  }
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <View
      accessible
      accessibilityLabel={`Mapa da rota com ${stops.length} paradas`}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height, borderRadius: 20, backgroundColor: colors.blueTint, borderWidth: 1, borderColor: '#C9D8FA', overflow: 'hidden' }}
    >
      {width > 0 && (
        <Svg width={width} height={height}>
          {points.length > 1 && (
            <Path d={d} stroke={colors.blue} strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" fill="none" />
          )}
          {points.map((p, i) => (
            <React.Fragment key={stops[i].id}>
              <Circle cx={p.x} cy={p.y} r={14} fill={colors.accent} />
              <SvgText x={p.x} y={p.y + 4.5} fontSize={13} fontWeight="700" fill={colors.white} textAnchor="middle">
                {String(i + 1)}
              </SvgText>
            </React.Fragment>
          ))}
        </Svg>
      )}
    </View>
  );
};
