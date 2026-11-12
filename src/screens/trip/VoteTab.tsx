import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SwipeDeck, type SwipeCardHandle } from '../../components/SwipeDeck';
import { Avatar, Button, Card, Chip, H2, IconButton, Progress } from '../../components/ui';
import { uid } from '../../lib/storage';
import { useStore } from '../../store';
import { catInfo, colors } from '../../theme';
import type { Category, Place, Trip, VoteValue } from '../../types';

type Props = { trip: Trip; voterId: string; onPickVoter: () => void; onDone: () => void };

export const VoteTab = ({ trip, voterId, onPickVoter, onDone }: Props) => {
  const { updateTrip, saved, toggleSaved } = useStore();
  const deck = useRef<SwipeCardHandle>(null);
  const [filter, setFilter] = useState<Category | null>(null);
  const [history, setHistory] = useState<{ voter: string; place: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<Category>('comida');

  const voter = trip.members.find((m) => m.id === voterId) ?? trip.members[0];
  const myVotes = trip.votes[voter.id] ?? {};
  const cats = useMemo(() => Array.from(new Set(trip.places.map((p) => p.cat))), [trip.places]);
  const remaining = trip.places.filter((p) => myVotes[p.id] === undefined && (!filter || p.cat === filter));
  const votedCount = trip.places.filter((p) => myVotes[p.id] !== undefined).length;
  const current = remaining[0];

  const vote = (place: Place, v: VoteValue) => {
    updateTrip(trip.id, (t) => ({
      ...t,
      votes: { ...t.votes, [voter.id]: { ...(t.votes[voter.id] ?? {}), [place.id]: v } },
    }));
    setHistory((h) => [...h, { voter: voter.id, place: place.id }]);
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    updateTrip(trip.id, (t) => {
      const mine = { ...(t.votes[last.voter] ?? {}) };
      delete mine[last.place];
      return { ...t, votes: { ...t.votes, [last.voter]: mine } };
    });
    setHistory((h) => h.slice(0, -1));
  };

  const addPlace = () => {
    const name = newName.trim();
    if (!name) return;
    // lugar manual não tem coordenada própria: entra no centro do destino
    const place: Place = {
      id: `custom-${uid()}`,
      name,
      cat: newCat,
      lat: trip.lat,
      lng: trip.lng,
      dur: 60,
      desc: 'Lugar adicionado pelo grupo.',
      custom: true,
    };
    updateTrip(trip.id, (t) => ({ ...t, places: [place, ...t.places] }), true);
    setNewName('');
    setAdding(false);
  };

  const approversOf = (p: Place) =>
    trip.members.filter((m) => m.id !== voter.id && (trip.votes[m.id]?.[p.id] ?? 0) > 0);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.topRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Votando como ${voter.name}. Trocar pessoa`} onPress={onPickVoter} style={s.voter}>
          <Avatar member={voter} size={28} />
          <Text style={s.voterText} numberOfLines={1}>
            {voter.name}
          </Text>
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Progress value={trip.places.length ? votedCount / trip.places.length : 0} color={voter.color} />
        </View>
        <Text style={s.count}>
          {votedCount} de {trip.places.length}
        </Text>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
          <Chip label="Tudo" active={filter === null} onPress={() => setFilter(null)} />
          {cats.map((c) => (
            <Chip key={c} label={catInfo[c].label} active={filter === c} onPress={() => setFilter(c)} />
          ))}
          <Chip label="+ Adicionar lugar" onPress={() => setAdding((a) => !a)} />
        </ScrollView>
      </View>

      {adding && (
        <Card style={s.addBox}>
          <TextInput
            accessibilityLabel="Nome do lugar"
            value={newName}
            onChangeText={setNewName}
            placeholder="Nome do lugar"
            placeholderTextColor={colors.muted}
            style={s.input}
            maxLength={60}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(Object.keys(catInfo) as Category[]).map((c) => (
              <Chip key={c} label={catInfo[c].label} active={newCat === c} onPress={() => setNewCat(c)} />
            ))}
          </ScrollView>
          <Button label="Adicionar à votação" small disabled={!newName.trim()} onPress={addPlace} />
        </Card>
      )}

      {current ? (
        <>
          <SwipeDeck ref={deck} current={current} next={remaining[1]} approversOf={approversOf} onVote={vote} />
          <View style={s.actions}>
            <IconButton icon="undo" label="Desfazer último voto" onPress={undo} size={48} color={colors.muted} disabled={history.length === 0} />
            <IconButton icon="x" label="Passo" onPress={() => deck.current?.fling(-1)} size={68} border={colors.ink} iconSize={28} />
            <IconButton icon="star" label="Imperdível" onPress={() => deck.current?.fling(2)} size={56} bg={colors.accent} color={colors.white} border={false} />
            <IconButton icon="check" label="Bora" onPress={() => deck.current?.fling(1)} size={68} bg={colors.blue} color={colors.white} border={false} iconSize={30} />
            <IconButton
              icon="bookmark"
              label={saved.some((p) => p.id === current.id) ? 'Remover dos salvos' : 'Salvar lugar'}
              onPress={() => toggleSaved(current, trip.destination)}
              size={48}
              bg={saved.some((p) => p.id === current.id) ? colors.ink : colors.surface}
              color={saved.some((p) => p.id === current.id) ? colors.white : colors.muted}
            />
          </View>
          <Text style={s.hint}>Arraste: direita bora, esquerda passo, para cima imperdível</Text>
        </>
      ) : (
        <View style={s.done}>
          <H2 style={{ fontSize: 22, textAlign: 'center' }}>
            {filter ? `Sem mais lugares em ${catInfo[filter].label}` : `${voter.name} votou em tudo`}
          </H2>
          <Text style={s.doneText}>
            {filter ? 'Troque o filtro para ver o resto.' : 'Veja o consenso do grupo e gere o roteiro.'}
          </Text>
          {filter ? (
            <Button label="Ver todos" kind="outline" onPress={() => setFilter(null)} />
          ) : (
            <Button label="Ver consenso do grupo" onPress={onDone} />
          )}
          {history.length > 0 && <Button label="Desfazer último voto" kind="ghost" onPress={undo} />}
        </View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 6 },
  voter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    maxWidth: 150,
  },
  voterText: { fontSize: 14, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  count: { fontSize: 13, fontWeight: '600', color: colors.ink },
  filters: { paddingHorizontal: 20, paddingTop: 10, gap: 8 },
  addBox: { marginHorizontal: 20, marginTop: 10, padding: 12, gap: 10 },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 20 },
  hint: { textAlign: 'center', fontSize: 12, color: colors.muted, paddingVertical: 10 },
  done: { flex: 1, padding: 28, justifyContent: 'center', gap: 12 },
  doneText: { fontSize: 15, lineHeight: 22, color: colors.body, textAlign: 'center' },
});
