import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { load, save, uid, inviteCode } from './lib/storage';
import { mergeRemote, pullTrip, pushTrip, subscribeTrip, syncEnabled } from './lib/sync';
import { memberColors } from './theme';
import type { Destination, Place, Profile, SavedPlace, Trip } from './types';

export type SyncStatus = 'local' | 'syncing' | 'ok' | 'offline';

type Store = {
  ready: boolean;
  profile: Profile;
  setProfile: (p: Partial<Profile>) => void;
  trips: Trip[];
  createTrip: (input: { destination: Destination; days: number; perDay: number }) => Trip;
  joinTrip: (code: string) => Promise<Trip>;
  /** touch = true quando muda dado compartilhado (lugares, roteiro, checklist) */
  updateTrip: (id: string, fn: (t: Trip) => Trip, touch?: boolean) => void;
  deleteTrip: (id: string) => void;
  saved: SavedPlace[];
  toggleSaved: (place: Place, destination: string) => void;
  syncStatus: Record<string, SyncStatus>;
  syncNow: (id: string) => Promise<void>;
  watchTrip: (id: string) => () => void;
};

const Ctx = createContext<Store | null>(null);

const DEFAULT_CHECKLIST = ['Documentos e passagens', 'Reserva da hospedagem', 'Seguro viagem', 'Carregador e adaptador'];

export const StoreProvider = ({ children }: { children: React.ReactNode }) => {
  const [ready, setReady] = useState(false);
  const [profile, setProfileState] = useState<Profile>({ id: uid(), name: '', color: memberColors[0] });
  const [trips, setTrips] = useState<Trip[]>([]);
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatus>>({});
  const tripsRef = useRef<Trip[]>([]);
  tripsRef.current = trips;
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    (async () => {
      const [p, t, s] = await Promise.all([
        load<Profile | null>('bora.profile', null),
        load<Trip[]>('bora.trips', []),
        load<SavedPlace[]>('bora.saved', []),
      ]);
      if (p) setProfileState(p);
      setTrips(t);
      setSaved(s);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) void save('bora.trips', trips);
  }, [ready, trips]);
  useEffect(() => {
    if (ready) void save('bora.saved', saved);
  }, [ready, saved]);
  useEffect(() => {
    if (ready) void save('bora.profile', profile);
  }, [ready, profile]);

  const setStatus = (id: string, s: SyncStatus) => setSyncStatus((prev) => ({ ...prev, [id]: s }));

  const syncNow = useCallback(async (id: string) => {
    const trip = tripsRef.current.find((t) => t.id === id);
    if (!trip) return;
    if (!syncEnabled()) {
      setStatus(id, 'local');
      return;
    }
    setStatus(id, 'syncing');
    try {
      await pushTrip(trip);
      const remote = await pullTrip(trip.code);
      if (remote) {
        setTrips((prev) => prev.map((t) => (t.id === id ? mergeRemote(t, remote) : t)));
      }
      setStatus(id, 'ok');
    } catch {
      // sem rede ou servidor fora: segue local e tenta de novo na próxima mudança
      setStatus(id, 'offline');
    }
  }, []);

  /** Só baixa e junta o estado remoto (usado nos avisos em tempo real, para não gerar eco). */
  const refresh = useCallback(async (id: string) => {
    const trip = tripsRef.current.find((t) => t.id === id);
    if (!trip || !syncEnabled()) return;
    try {
      const remote = await pullTrip(trip.code);
      if (remote) setTrips((prev) => prev.map((t) => (t.id === id ? mergeRemote(t, remote) : t)));
      setStatus(id, 'ok');
    } catch {
      setStatus(id, 'offline');
    }
  }, []);

  const scheduleSync = useCallback(
    (id: string) => {
      if (!syncEnabled()) return;
      clearTimeout(timers.current[id]);
      timers.current[id] = setTimeout(() => void syncNow(id), 800);
    },
    [syncNow],
  );

  const setProfile = useCallback((p: Partial<Profile>) => {
    setProfileState((prev) => {
      const next = { ...prev, ...p };
      // reflete nome e cor nas viagens em que este perfil participa
      setTrips((ts) =>
        ts.map((t) => ({
          ...t,
          members: t.members.map((m) => (m.id === next.id ? { ...m, name: next.name || 'Você', color: next.color } : m)),
        })),
      );
      return next;
    });
  }, []);

  const createTrip = useCallback<Store['createTrip']>(
    ({ destination, days, perDay }) => {
      const trip: Trip = {
        id: uid(),
        code: inviteCode(),
        destination: destination.name,
        lat: destination.lat,
        lng: destination.lng,
        days,
        pace: perDay <= 3 ? 'leve' : perDay <= 5 ? 'moderado' : 'intenso',
        perDay,
        searchKm: destination.radiusKm,
        places: destination.places,
        members: [{ id: profile.id, name: profile.name || 'Você', color: profile.color }],
        localMemberIds: [profile.id],
        votes: {},
        itinerary: null,
        checklist: DEFAULT_CHECKLIST.map((text) => ({ id: uid(), text, done: false })),
        updatedAt: Date.now(),
        shared: false,
      };
      setTrips((prev) => [trip, ...prev]);
      scheduleSync(trip.id);
      return trip;
    },
    [profile, scheduleSync],
  );

  const joinTrip = useCallback<Store['joinTrip']>(
    async (rawCode) => {
      const code = rawCode.trim().toUpperCase();
      const existing = tripsRef.current.find((t) => t.code === code);
      if (existing) return existing;
      if (!syncEnabled()) throw new Error('Para entrar por código, configure o Supabase (veja o README).');
      const remote = await pullTrip(code);
      if (!remote) throw new Error('Nenhuma viagem com esse código.');
      const me = { id: profile.id, name: profile.name || 'Convidado', color: profile.color };
      const trip: Trip = {
        ...remote,
        members: [...remote.members.filter((m) => m.id !== me.id), me],
        localMemberIds: [me.id],
        shared: true,
      };
      setTrips((prev) => [trip, ...prev]);
      scheduleSync(trip.id);
      return trip;
    },
    [profile, scheduleSync],
  );

  const updateTrip = useCallback<Store['updateTrip']>(
    (id, fn, touch = false) => {
      setTrips((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next = fn(t);
          return touch ? { ...next, updatedAt: Date.now() } : next;
        }),
      );
      scheduleSync(id);
    },
    [scheduleSync],
  );

  const deleteTrip = useCallback((id: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toggleSaved = useCallback((place: Place, destination: string) => {
    setSaved((prev) =>
      prev.some((p) => p.id === place.id) ? prev.filter((p) => p.id !== place.id) : [{ ...place, destination }, ...prev],
    );
  }, []);

  const watchTrip = useCallback(
    (id: string) => {
      const trip = tripsRef.current.find((t) => t.id === id);
      if (!trip || !syncEnabled()) return () => {};
      void syncNow(id);
      return subscribeTrip(trip.code, () => void refresh(id));
    },
    [refresh, syncNow],
  );

  const value = useMemo<Store>(
    () => ({
      ready,
      profile,
      setProfile,
      trips,
      createTrip,
      joinTrip,
      updateTrip,
      deleteTrip,
      saved,
      toggleSaved,
      syncStatus,
      syncNow,
      watchTrip,
    }),
    [ready, profile, setProfile, trips, createTrip, joinTrip, updateTrip, deleteTrip, saved, toggleSaved, syncStatus, syncNow, watchTrip],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useStore = (): Store => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider ausente');
  return s;
};
