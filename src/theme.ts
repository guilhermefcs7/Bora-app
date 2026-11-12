import type { Category, Pace } from './types';

export const colors = {
  bg: '#F4F5F7',
  surface: '#FFFFFF',
  ink: '#14213D',
  body: '#3B4558',
  muted: '#5B6478',
  line: '#E3E6EC',
  accent: '#C2410C',
  accentTint: '#FDEDE3',
  blue: '#1D4ED8',
  blueTint: '#E6EDFD',
  teal: '#0F766E',
  white: '#FFFFFF',
};

export const memberColors = ['#C2410C', '#1D4ED8', '#0F766E', '#7C3AED', '#BE185D', '#14213D'];

export const catInfo: Record<Category, { label: string; color: string }> = {
  monumento: { label: 'Monumento', color: '#1D4ED8' },
  museu: { label: 'Museu', color: '#7C3AED' },
  natureza: { label: 'Natureza', color: '#0F766E' },
  comida: { label: 'Comida', color: '#C2410C' },
  mirante: { label: 'Mirante', color: '#0369A1' },
  bairro: { label: 'Bairro', color: '#14213D' },
  compras: { label: 'Compras', color: '#BE185D' },
  noite: { label: 'Noite', color: '#4338CA' },
  praia: { label: 'Praia', color: '#B45309' },
};

export const paceInfo: Record<Pace, { label: string; perDay: number }> = {
  leve: { label: 'Leve', perDay: 3 },
  moderado: { label: 'Moderado', perDay: 4 },
  intenso: { label: 'Intenso', perDay: 6 },
};

export const priceLabel = (p: number) => (p === 0 ? 'Grátis' : '$'.repeat(p));

export const durLabel = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
};
