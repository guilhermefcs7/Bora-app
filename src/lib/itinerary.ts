import { perDayOf } from '../theme';
import type { Place, Trip } from '../types';
import { rankPlaces } from './consensus';
import { distanceKm, travel } from './geo';

const routeLength = (route: Place[]) => {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += distanceKm(route[i - 1], route[i]);
  return total;
};

/** Ordena as paradas de um dia: vizinho mais próximo, depois refino 2-opt. */
export const optimizeRoute = (stops: Place[]): Place[] => {
  if (stops.length <= 2) return [...stops];
  let best: Place[] = [];
  let bestLen = Infinity;
  // testa cada parada como ponto de partida e fica com a rota mais curta
  for (let s = 0; s < stops.length; s++) {
    const rest = stops.filter((_, i) => i !== s);
    const route = [stops[s]];
    while (rest.length) {
      const last = route[route.length - 1];
      let k = 0;
      for (let i = 1; i < rest.length; i++) {
        if (distanceKm(last, rest[i]) < distanceKm(last, rest[k])) k = i;
      }
      route.push(rest.splice(k, 1)[0]);
    }
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < route.length - 1; i++) {
        for (let j = i + 1; j < route.length; j++) {
          const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
          if (routeLength(candidate) + 1e-9 < routeLength(route)) {
            route.splice(0, route.length, ...candidate);
            improved = true;
          }
        }
      }
    }
    const len = routeLength(route);
    if (len < bestLen) {
      bestLen = len;
      best = route;
    }
  }
  return best;
};

/** Divide os lugares escolhidos em dias, juntando os que ficam perto. */
const clusterByDay = (chosen: Place[], days: number): Place[][] => {
  // usa todos os dias da viagem: espalha as atividades em vez de lotar os primeiros dias
  const k = Math.min(days, chosen.length);
  if (k === 1) return [chosen];
  // sementes: pontos mais distantes entre si
  const seeds: Place[] = [chosen[0]];
  while (seeds.length < k) {
    let far = chosen[0];
    let farD = -1;
    for (const p of chosen) {
      const d = Math.min(...seeds.map((s) => distanceKm(s, p)));
      if (d > farD) {
        farD = d;
        far = p;
      }
    }
    seeds.push(far);
  }
  // dias equilibrados: a diferença entre o dia mais cheio e o mais vazio é de no máximo 1
  const base = Math.floor(chosen.length / k);
  const extra = chosen.length % k;
  const caps = seeds.map((_, i) => base + (i < extra ? 1 : 0));
  const groups: Place[][] = seeds.map(() => []);
  // atribui primeiro quem tem preferência mais forte por uma semente
  const pending = chosen
    .map((p) => {
      const ds = seeds.map((s) => distanceKm(s, p)).sort((a, b) => a - b);
      return { p, regret: (ds[1] ?? ds[0]) - ds[0] };
    })
    .sort((a, b) => b.regret - a.regret);
  for (const { p } of pending) {
    const order = seeds.map((s, i) => ({ i, d: distanceKm(s, p) })).sort((a, b) => a.d - b.d);
    const slot = order.find((o) => groups[o.i].length < caps[o.i]) ?? order[0];
    groups[slot.i].push(p);
  }
  return groups.filter((g) => g.length > 0);
};

/** Gera o roteiro: escolhe os mais votados, agrupa por proximidade e ordena cada dia. */
export const generateItinerary = (
  trip: Pick<Trip, 'places' | 'members' | 'votes' | 'days' | 'pace' | 'perDay'>,
): string[][] => {
  const perDay = perDayOf(trip);
  const ranked = rankPlaces(trip);
  const approved = ranked.filter((r) => r.points > 0);
  // sem nenhum voto positivo, usa os lugares ainda não votados para não devolver roteiro vazio
  const pool = approved.length > 0 ? approved : ranked.filter((r) => r.voters === 0);
  const chosen = pool.slice(0, trip.days * perDay).map((r) => r.place);
  if (chosen.length === 0) return Array.from({ length: trip.days }, () => []);
  const groups = clusterByDay(chosen, trip.days).map(optimizeRoute);
  // dias com mais pontos do grupo primeiro
  const score = new Map(ranked.map((r) => [r.place.id, r.points]));
  groups.sort(
    (a, b) =>
      b.reduce((s, p) => s + (score.get(p.id) ?? 0), 0) / b.length -
      a.reduce((s, p) => s + (score.get(p.id) ?? 0), 0) / a.length,
  );
  const out = groups.map((g) => g.map((p) => p.id));
  // só sobra dia vazio quando há menos lugares aprovados do que dias: intercala os livres
  // entre os dias com passeio, em vez de deixar todos no fim
  const empty = trip.days - out.length;
  if (empty <= 0) return out;
  const spread: string[][] = [];
  const every = out.length / (empty + 1);
  let placed = 0;
  out.forEach((day, i) => {
    spread.push(day);
    if (placed < empty && i + 1 >= Math.round(every * (placed + 1)) && i < out.length - 1) {
      spread.push([]);
      placed++;
    }
  });
  while (spread.length < trip.days) spread.push([]);
  return spread;
};

export type Stop = {
  place: Place;
  /** minutos desde 00:00 */
  start: number;
  end: number;
  /** deslocamento até a próxima parada */
  next?: { km: number; minutes: number; mode: string };
};

export const DAY_START = 9 * 60;

export const scheduleDay = (stops: Place[]): Stop[] => {
  let clock = DAY_START;
  return stops.map((place, i) => {
    const start = clock;
    const end = start + place.dur;
    let next: Stop['next'];
    if (i < stops.length - 1) {
      const km = distanceKm(place, stops[i + 1]);
      const t = travel(km);
      next = { km, minutes: t.minutes, mode: t.mode };
      // arredonda a chegada para múltiplos de 5 minutos
      clock = Math.ceil((end + t.minutes) / 5) * 5;
    }
    return { place, start, end, next };
  });
};

export const clockLabel = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const dayDistanceKm = (stops: Place[]) => routeLength(stops);

export const itineraryPlaces = (trip: Pick<Trip, 'places' | 'itinerary'>): Place[][] => {
  const byId = new Map(trip.places.map((p) => [p.id, p]));
  return (trip.itinerary ?? []).map((day) => day.map((id) => byId.get(id)).filter((p): p is Place => !!p));
};

export const itineraryText = (trip: Pick<Trip, 'places' | 'itinerary' | 'destination' | 'days'>): string => {
  const lines = [`Roteiro: ${trip.destination} (${trip.days} ${trip.days === 1 ? 'dia' : 'dias'})`, ''];
  itineraryPlaces(trip).forEach((day, i) => {
    lines.push(`Dia ${i + 1}`);
    if (day.length === 0) lines.push('  Dia livre');
    for (const s of scheduleDay(day)) lines.push(`  ${clockLabel(s.start)}  ${s.place.name}`);
    lines.push('');
  });
  lines.push('Feito no Bora');
  return lines.join('\n');
};
