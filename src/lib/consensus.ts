import type { Place, Trip, VoteValue } from '../types';

export type Ranked = {
  place: Place;
  /** soma dos votos: imperdível 2, bora 1, passo -1 */
  points: number;
  /** aprovações / votos dados (0 a 1); 0 se ninguém votou */
  approval: number;
  voters: number;
  likes: string[];
  supers: string[];
  nopes: string[];
};

export const rankPlaces = (trip: Pick<Trip, 'places' | 'members' | 'votes'>): Ranked[] => {
  const ranked = trip.places.map((place): Ranked => {
    const likes: string[] = [];
    const supers: string[] = [];
    const nopes: string[] = [];
    for (const m of trip.members) {
      const v: VoteValue | undefined = trip.votes[m.id]?.[place.id];
      if (v === 2) supers.push(m.id);
      else if (v === 1) likes.push(m.id);
      else if (v === -1) nopes.push(m.id);
    }
    const voters = likes.length + supers.length + nopes.length;
    return {
      place,
      points: supers.length * 2 + likes.length - nopes.length,
      approval: voters === 0 ? 0 : (likes.length + supers.length) / voters,
      voters,
      likes,
      supers,
      nopes,
    };
  });
  return ranked.sort(
    (a, b) => b.points - a.points || b.approval - a.approval || a.place.name.localeCompare(b.place.name),
  );
};

export const memberProgress = (trip: Pick<Trip, 'places' | 'votes'>, memberId: string) => {
  const done = trip.places.filter((p) => trip.votes[memberId]?.[p.id] !== undefined).length;
  return { done, total: trip.places.length };
};

export const consensusLabel = (r: Ranked, memberCount: number): string => {
  if (r.voters === 0) return 'Ninguém votou ainda';
  const yes = r.likes.length + r.supers.length;
  const base = yes === r.voters && r.voters === memberCount ? 'Todos aprovaram' : `${yes} de ${r.voters} aprovaram`;
  return r.supers.length > 0 ? `${base} · ${r.supers.length} imperdível` : base;
};
