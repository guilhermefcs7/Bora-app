import { perDayOf } from '../theme';
import type { Place, Trip } from '../types';
import { rankPlaces } from './consensus';
import { distanceKm, travel } from './geo';

const routeLength = (route: Place[]) => {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += distanceKm(route[i - 1], route[i]);
  return total;
};

/**
 * Ordena as paradas de um dia: vizinho mais próximo, depois refino 2-opt.
 * Com `anchor` (a hospedagem), minimiza o percurso completo: sair dela, visitar tudo e voltar.
 */
export const optimizeRoute = (stops: Place[], anchor?: { lat: number; lng: number }): Place[] => {
  if (stops.length <= 1 || (stops.length === 2 && !anchor)) return [...stops];
  const cost = (r: Place[]) =>
    routeLength(r) + (anchor ? distanceKm(anchor, r[0]) + distanceKm(r[r.length - 1], anchor) : 0);
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
          if (cost(candidate) + 1e-9 < cost(route)) {
            route.splice(0, route.length, ...candidate);
            improved = true;
          }
        }
      }
    }
    const len = cost(route);
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
  trip: Pick<Trip, 'places' | 'members' | 'votes' | 'days' | 'pace' | 'perDay' | 'base'>,
): string[][] => {
  const perDay = perDayOf(trip);
  const ranked = rankPlaces(trip);
  const approved = ranked.filter((r) => r.points > 0);
  // sem nenhum voto positivo, usa os lugares ainda não votados para não devolver roteiro vazio
  const pool = approved.length > 0 ? approved : ranked.filter((r) => r.voters === 0);
  const chosen = pool.slice(0, trip.days * perDay).map((r) => r.place);
  if (chosen.length === 0) return Array.from({ length: trip.days }, () => []);
  const rough = clusterByDay(chosen, trip.days).map((g) => g.map((p) => p.id));
  // mesmo refino do "Reorganizar viagem": o roteiro já nasce com os dias compactos
  const groups = itineraryPlaces({
    places: trip.places,
    itinerary: reorganize({ places: trip.places, itinerary: rough, days: rough.length, base: trip.base }),
  }).filter((g) => g.length > 0);
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

// ---------- Reorganizar a viagem inteira ----------

type Anchor = { lat: number; lng: number } | undefined;

/** Comprimento do dia; com hospedagem definida, conta a ida até a primeira parada e a volta da última. */
export const loopKm = (route: Place[], anchor?: Anchor): number =>
  routeLength(route) +
  (anchor && route.length ? distanceKm(anchor, route[0]) + distanceKm(route[route.length - 1], anchor) : 0);

export const tripKm = (days: Place[][], anchor?: Anchor) => days.reduce((sum, d) => sum + loopKm(d, anchor), 0);

const centroid = (ps: Place[]) => ({
  lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length,
  lng: ps.reduce((s, p) => s + p.lng, 0) / ps.length,
});

/**
 * Redistribui as paradas do roteiro atual entre os dias, juntando o que fica perto,
 * e reordena cada dia. Paradas fixadas não mudam de dia. Não troca os lugares escolhidos.
 */
export const reorganize = (trip: Pick<Trip, 'places' | 'itinerary' | 'days' | 'locked' | 'base'>): string[][] => {
  const current = itineraryPlaces(trip);
  const days = Math.max(trip.days, current.length);
  const locked = new Set(trip.locked ?? []);
  const fixed: Place[][] = Array.from({ length: days }, (_, d) => (current[d] ?? []).filter((p) => locked.has(p.id)));
  const free = current.flat().filter((p) => !locked.has(p.id));
  const total = fixed.flat().length + free.length;
  if (total === 0) return Array.from({ length: days }, () => []);

  // dias equilibrados; as sobras vão para os dias que já têm mais paradas fixadas
  const baseSize = Math.floor(total / days);
  const extra = total % days;
  const target: number[] = Array.from({ length: days }, () => baseSize);
  [...Array(days).keys()]
    .sort((a, b) => fixed[b].length - fixed[a].length || a - b)
    .slice(0, extra)
    .forEach((d) => target[d]++);
  const room = target.map((t, d) => Math.max(0, t - fixed[d].length));
  // se as fixadas estouram o equilíbrio, o que falta de vaga vai para os dias mais vazios
  let missing = free.length - room.reduce((a, b) => a + b, 0);
  while (missing > 0) {
    let d = 0;
    for (let i = 1; i < days; i++) if (fixed[i].length + room[i] < fixed[d].length + room[d]) d = i;
    room[d]++;
    missing--;
  }

  // cada dia ganha um "centro": o das paradas fixadas ou, nos dias sem nenhuma, o ponto livre mais isolado
  const seeds: ({ lat: number; lng: number } | null)[] = fixed.map((f) => (f.length ? centroid(f) : null));
  const usedAsSeed = new Set<string>();
  for (let d = 0; d < days; d++) {
    if (seeds[d] || room[d] === 0) continue;
    const known = seeds.filter((x): x is { lat: number; lng: number } => !!x);
    let pick: Place | undefined;
    let far = -1;
    for (const p of free) {
      if (usedAsSeed.has(p.id)) continue;
      const dist = known.length ? Math.min(...known.map((k) => distanceKm(k, p))) : trip.base ? distanceKm(trip.base, p) : 0;
      if (dist > far) {
        far = dist;
        pick = p;
      }
    }
    if (pick) {
      usedAsSeed.add(pick.id);
      seeds[d] = { lat: pick.lat, lng: pick.lng };
    }
  }

  const groups = fixed.map((f) => [...f]);
  const open = () => seeds.map((sd, d) => ({ sd, d })).filter((x) => x.sd && room[x.d] > 0) as { sd: { lat: number; lng: number }; d: number }[];
  // atribui primeiro quem perde mais se não ficar no dia mais próximo
  const pending = free
    .map((p) => {
      const ds = seeds.filter((x): x is { lat: number; lng: number } => !!x).map((sd) => distanceKm(sd, p)).sort((a, b) => a - b);
      return { p, regret: (ds[1] ?? ds[0] ?? 0) - (ds[0] ?? 0) };
    })
    .sort((a, b) => b.regret - a.regret);
  for (const { p } of pending) {
    const options = open().sort((a, b) => distanceKm(a.sd, p) - distanceKm(b.sd, p));
    const slot = options[0]?.d ?? 0;
    groups[slot].push(p);
    room[slot] = Math.max(0, room[slot] - 1);
  }
  // refino: troca paradas livres entre dias enquanto isso deixar os dias mais compactos.
  // A medida é a soma das distâncias de cada parada ao centro do seu dia (barata de calcular).
  const spread = (g: Place[]) => {
    if (g.length < 2) return 0;
    const c = centroid(g);
    return g.reduce((sum, p) => sum + distanceKm(c, p), 0);
  };
  let improved = true;
  for (let pass = 0; improved && pass < 40; pass++) {
    improved = false;
    for (let a = 0; a < days; a++) {
      for (let b = a + 1; b < days; b++) {
        for (let i = 0; i < groups[a].length; i++) {
          if (locked.has(groups[a][i].id)) continue;
          for (let j = 0; j < groups[b].length; j++) {
            if (locked.has(groups[b][j].id)) continue;
            const before = spread(groups[a]) + spread(groups[b]);
            const ga = [...groups[a]];
            const gb = [...groups[b]];
            [ga[i], gb[j]] = [gb[j], ga[i]];
            if (spread(ga) + spread(gb) + 1e-9 < before) {
              groups[a] = ga;
              groups[b] = gb;
              improved = true;
            }
          }
        }
      }
    }
  }
  return groups.map((g) => optimizeRoute(g, trip.base).map((p) => p.id));
};

export type ItineraryChange = {
  moves: { place: Place; from: number; to: number }[];
  /** dias em que só a ordem mudou */
  reordered: number[];
  kmBefore: number;
  kmAfter: number;
};

/** Compara o roteiro atual com uma proposta, para mostrar a prévia antes de aplicar. */
export const itineraryChanges = (
  trip: Pick<Trip, 'places' | 'itinerary' | 'base'>,
  next: string[][],
): ItineraryChange => {
  const before = itineraryPlaces(trip);
  const after = itineraryPlaces({ places: trip.places, itinerary: next });
  const dayOf = new Map<string, number>();
  before.forEach((d, i) => d.forEach((p) => dayOf.set(p.id, i)));
  const moves: ItineraryChange['moves'] = [];
  after.forEach((d, i) =>
    d.forEach((p) => {
      const from = dayOf.get(p.id);
      if (from !== undefined && from !== i) moves.push({ place: p, from, to: i });
    }),
  );
  const reordered: number[] = [];
  after.forEach((d, i) => {
    const a = (before[i] ?? []).map((p) => p.id);
    const b = d.map((p) => p.id);
    const sameSet = a.length === b.length && [...a].sort().join() === [...b].sort().join();
    if (sameSet && a.join() !== b.join()) reordered.push(i);
  });
  return { moves, reordered, kmBefore: tripKm(before, trip.base), kmAfter: tripKm(after, trip.base) };
};
