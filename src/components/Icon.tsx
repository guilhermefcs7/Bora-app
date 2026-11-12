import React from 'react';
import Svg, { Path } from 'react-native-svg';
import type { Category } from '../types';

const paths = {
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  star: ['m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-15-6.7L3 13'],
  bookmark: ['M6 3h12v18l-6-4-6 4z'],
  back: ['m15 18-6-6 6-6'],
  plus: ['M12 5v14', 'M5 12h14'],
  up: ['m18 15-6-6-6 6'],
  down: ['m6 9 6 6 6-6'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14'],
  share: ['M12 15V3', 'm7 8 5-5 5 5', 'M5 12v8h14v-8'],
  refresh: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  swap: ['M7 4 3 8l4 4', 'M3 8h14', 'm17 12 4 4-4 4', 'M21 16H7'],
  // categorias
  monumento: ['M3 21h18', 'M5 21V10l7-6 7 6v11', 'M9 21v-6h6v6'],
  museu: ['M3 21h18', 'M4 10h16', 'M12 3 4 10h16z', 'M7 10v8', 'M12 10v8', 'M17 10v8'],
  natureza: ['M12 22v-7', 'M12 3 6 11h3l-4 5h14l-4-5h3z'],
  comida: ['M7 3v8', 'M4 3v5a3 3 0 0 0 6 0V3', 'M7 11v10', 'M17 3c-2 2-3 5-3 8h3v10'],
  mirante: ['m3 20 6-11 4 6 2-3 6 8z', 'M17 6a2 2 0 1 0 0-.01'],
  bairro: ['M3 21h18', 'M5 21V7h6v14', 'M11 21V11h8v10', 'M8 10v.01', 'M8 14v.01', 'M15 14v.01', 'M15 17v.01'],
  compras: ['M5 8h14l-1 13H6z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  noite: ['M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z'],
  praia: ['M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0', 'M12 14V6', 'M5 10a7 7 0 0 1 14 0z'],
} as const;

export type IconName = keyof typeof paths;

export const Icon = ({
  name,
  size = 22,
  color = '#14213D',
  stroke = 2,
}: {
  name: IconName | Category;
  size?: number;
  color?: string;
  stroke?: number;
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {paths[name].map((d) => (
      <Path key={d} d={d} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    ))}
  </Svg>
);
