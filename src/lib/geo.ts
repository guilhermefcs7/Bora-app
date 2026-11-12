export type LatLng = { lat: number; lng: number };

const R = 6371; // km

export const distanceKm = (a: LatLng, b: LatLng): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Estimativa de deslocamento urbano: a pé até 1,5 km, depois transporte. */
export const travel = (km: number): { minutes: number; mode: 'a pé' | 'de transporte' } => {
  // ruas não são linha reta: fator 1,3 sobre a distância geodésica
  const real = km * 1.3;
  if (real <= 1.5) return { minutes: Math.max(2, Math.round((real / 4.8) * 60)), mode: 'a pé' };
  return { minutes: Math.round((real / 18) * 60) + 8, mode: 'de transporte' };
};

export const kmLabel = (km: number) => (km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1).replace('.', ',')} km`);
