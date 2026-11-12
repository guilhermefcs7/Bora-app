import { Linking, Platform, Share } from 'react-native';
import type { Place } from '../types';

/** Compartilha texto pelo sistema; na web, copia para a área de transferência. */
export const shareText = async (message: string): Promise<'shared' | 'copied' | 'failed'> => {
  if (Platform.OS !== 'web') {
    try {
      await Share.share({ message });
      return 'shared';
    } catch {
      return 'failed';
    }
  }
  try {
    const nav = (globalThis as { navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } } }).navigator;
    if (!nav?.clipboard) return 'failed';
    await nav.clipboard.writeText(message);
    return 'copied';
  } catch {
    return 'failed';
  }
};

/** Link de rota do Google Maps, que abre o app de mapas do aparelho quando instalado. */
export const mapsUrl = (stops: Place[]): string =>
  stops.length === 1
    ? `https://www.google.com/maps/search/?api=1&query=${stops[0].lat},${stops[0].lng}`
    : `https://www.google.com/maps/dir/${stops.map((p) => `${p.lat},${p.lng}`).join('/')}`;

export const openMaps = async (stops: Place[]): Promise<boolean> => {
  if (stops.length === 0) return false;
  try {
    await Linking.openURL(mapsUrl(stops));
    return true;
  } catch {
    return false;
  }
};
