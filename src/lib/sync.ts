import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { Member, Trip, VoteValue } from '../types';

// Sincronização opcional do grupo. Sem as variáveis de ambiente, o app roda em modo local.

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;
try {
  if (url && key) client = createClient(url, key, { auth: { persistSession: false } });
} catch {
  client = null;
}

export const syncEnabled = () => client !== null;

/** Parte da viagem compartilhada entre todos (membros e votos ficam em tabelas próprias). */
type SharedData = Pick<
  Trip,
  'id' | 'destination' | 'lat' | 'lng' | 'days' | 'pace' | 'perDay' | 'places' | 'itinerary' | 'checklist' | 'updatedAt'
>;

const sharedOf = (t: Trip): SharedData => ({
  id: t.id,
  destination: t.destination,
  lat: t.lat,
  lng: t.lng,
  days: t.days,
  pace: t.pace,
  perDay: t.perDay,
  places: t.places,
  itinerary: t.itinerary,
  checklist: t.checklist,
  updatedAt: t.updatedAt,
});

/** Envia os dados da viagem e tudo o que pertence a este aparelho (membros locais e seus votos). */
export const pushTrip = async (trip: Trip): Promise<void> => {
  if (!client) throw new Error('Sincronização não configurada');
  const remote = await client.from('trips').select('data').eq('code', trip.code).maybeSingle();
  if (remote.error) throw remote.error;
  const remoteAt = (remote.data?.data as SharedData | undefined)?.updatedAt ?? 0;
  if (trip.updatedAt >= remoteAt) {
    const up = await client.from('trips').upsert({ code: trip.code, data: sharedOf(trip) });
    if (up.error) throw up.error;
  }
  const mine = trip.members.filter((m) => trip.localMemberIds.includes(m.id));
  if (mine.length) {
    const m = await client
      .from('members')
      .upsert(mine.map((x) => ({ trip_code: trip.code, member_id: x.id, name: x.name, color: x.color })));
    if (m.error) throw m.error;
  }
  const rows = mine.flatMap((x) =>
    Object.entries(trip.votes[x.id] ?? {}).map(([place_id, value]) => ({
      trip_code: trip.code,
      member_id: x.id,
      place_id,
      value,
    })),
  );
  if (rows.length) {
    const v = await client.from('votes').upsert(rows);
    if (v.error) throw v.error;
  }
};

/** Busca a viagem pelo código. Retorna null se não existir. */
export const pullTrip = async (code: string): Promise<Omit<Trip, 'localMemberIds' | 'shared'> | null> => {
  if (!client) throw new Error('Sincronização não configurada');
  const t = await client.from('trips').select('data').eq('code', code).maybeSingle();
  if (t.error) throw t.error;
  if (!t.data) return null;
  const [m, v] = await Promise.all([
    client.from('members').select('member_id,name,color').eq('trip_code', code),
    client.from('votes').select('member_id,place_id,value').eq('trip_code', code),
  ]);
  if (m.error) throw m.error;
  if (v.error) throw v.error;
  const members: Member[] = (m.data ?? []).map((r) => ({ id: r.member_id, name: r.name, color: r.color }));
  const votes: Trip['votes'] = {};
  for (const r of v.data ?? []) {
    (votes[r.member_id] ??= {})[r.place_id] = r.value as VoteValue;
  }
  return { ...(t.data.data as SharedData), code, members, votes };
};

/** Junta o estado remoto ao local: o que é deste aparelho vence; o resto vem do servidor. */
export const mergeRemote = (local: Trip, remote: Omit<Trip, 'localMemberIds' | 'shared'>): Trip => {
  const own = new Set(local.localMemberIds);
  const members = [
    ...local.members.filter((x) => own.has(x.id)),
    ...remote.members.filter((x) => !own.has(x.id)),
  ];
  const votes: Trip['votes'] = {};
  for (const mb of members) votes[mb.id] = own.has(mb.id) ? (local.votes[mb.id] ?? {}) : (remote.votes[mb.id] ?? {});
  const newer = remote.updatedAt > local.updatedAt;
  return {
    ...local,
    ...(newer
      ? {
          places: remote.places,
          itinerary: remote.itinerary,
          checklist: remote.checklist,
          days: remote.days,
          pace: remote.pace,
          perDay: remote.perDay,
          updatedAt: remote.updatedAt,
        }
      : {}),
    members,
    votes,
    shared: true,
  };
};

/** Avisa quando algo da viagem muda no servidor. Retorna a função para cancelar. */
export const subscribeTrip = (code: string, onChange: () => void): (() => void) => {
  if (!client) return () => {};
  const c = client;
  let channel: RealtimeChannel | null = c.channel(`trip-${code}`);
  for (const [table, column] of [
    ['trips', 'code'],
    ['members', 'trip_code'],
    ['votes', 'trip_code'],
  ] as const) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `${column}=eq.${code}` }, onChange);
  }
  channel.subscribe();
  return () => {
    if (channel) void c.removeChannel(channel);
    channel = null;
  };
};
