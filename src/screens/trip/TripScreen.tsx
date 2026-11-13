import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PlaceDetail } from '../../components/PlaceDetail';
import { Avatar, Button, Card, H2, Header, IconButton } from '../../components/ui';
import { generateItinerary } from '../../lib/itinerary';
import { useNav } from '../../nav';
import { useStore } from '../../store';
import { activitiesLabel, colors, perDayOf } from '../../theme';
import { ChecklistTab } from './ChecklistTab';
import { GroupTab } from './GroupTab';
import { ItineraryTab } from './ItineraryTab';
import { VoteTab } from './VoteTab';

type Tab = 'votar' | 'grupo' | 'roteiro' | 'checklist';
const tabs: [Tab, string][] = [
  ['votar', 'Votar'],
  ['grupo', 'Grupo'],
  ['roteiro', 'Roteiro'],
  ['checklist', 'Checklist'],
];

export const TripScreen = ({ id, initialTab }: { id: string; initialTab?: Tab }) => {
  const nav = useNav();
  const { trips, profile, updateTrip, deleteTrip, watchTrip } = useStore();
  const trip = trips.find((t) => t.id === id);
  const [tab, setTab] = useState<Tab>(initialTab ?? (trip?.itinerary ? 'roteiro' : 'votar'));
  const [voterId, setVoterId] = useState(profile.id);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => watchTrip(id), [id, watchTrip]);

  if (!trip) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="Viagem não encontrada" onBack={nav.back} />
      </View>
    );
  }

  const localMembers = trip.members.filter((m) => trip.localMemberIds.includes(m.id));
  const activeVoter = localMembers.some((m) => m.id === voterId) ? voterId : (localMembers[0]?.id ?? trip.members[0].id);

  const generate = () => {
    // gerar de novo parte dos votos: as paradas fixadas à mão deixam de valer
    updateTrip(trip.id, (t) => ({ ...t, itinerary: generateItinerary(t), locked: [] }), true);
    setTab('roteiro');
  };

  return (
    <View style={{ flex: 1 }}>
      <Header
        title={trip.destination}
        subtitle={`${trip.days} ${trip.days === 1 ? 'dia' : 'dias'} · ${activitiesLabel(perDayOf(trip))} por dia · ${trip.members.length} ${trip.members.length === 1 ? 'pessoa' : 'pessoas'}`}
        onBack={nav.back}
        right={<IconButton icon="trash" label="Excluir viagem" onPress={() => setConfirmDelete(true)} color={colors.muted} />}
      />

      {confirmDelete && (
        <Card style={s.confirm}>
          <Text style={s.confirmText}>Excluir esta viagem deste aparelho? Não dá para desfazer.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Cancelar" kind="outline" small onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
            <Button
              label="Excluir"
              small
              style={{ flex: 1, backgroundColor: '#B91C1C' }}
              onPress={() => {
                deleteTrip(trip.id);
                nav.back();
              }}
            />
          </View>
        </Card>
      )}

      <View accessibilityRole="tablist" style={s.tabs}>
        {tabs.map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={[s.tab, tab === key && s.tabOn]}
          >
            <Text style={[s.tabText, tab === key && { color: colors.white, fontWeight: '700' }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {picking && (
        <Card style={s.picker}>
          <H2>Quem está votando?</H2>
          {localMembers.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityState={{ selected: m.id === activeVoter }}
              onPress={() => {
                setVoterId(m.id);
                setPicking(false);
              }}
              style={[s.pickRow, m.id === activeVoter && { backgroundColor: colors.bg }]}
            >
              <Avatar member={m} />
              <Text style={s.pickName}>{m.name}</Text>
            </Pressable>
          ))}
          <Text style={s.hint}>Para adicionar outra pessoa neste aparelho, use a aba Grupo.</Text>
          <Button label="Fechar" kind="outline" small onPress={() => setPicking(false)} />
        </Card>
      )}

      <View style={{ flex: 1 }}>
        {tab === 'votar' && (
          <VoteTab
            trip={trip}
            voterId={activeVoter}
            onPickVoter={() => setPicking((p) => !p)}
            onDone={() => setTab('grupo')}
            onMore={(p) => setDetailId(p.id)}
          />
        )}
        {tab === 'grupo' && <GroupTab trip={trip} onGenerate={generate} />}
        {tab === 'roteiro' && <ItineraryTab trip={trip} onGenerate={generate} onVote={() => setTab('votar')} onMore={(p) => setDetailId(p.id)} />}
        {tab === 'checklist' && <ChecklistTab trip={trip} />}
      </View>

      <PlaceDetail
        place={trip.places.find((p) => p.id === detailId) ?? null}
        myInterests={profile.interests}
        onClose={() => setDetailId(null)}
        onLoaded={(placeId, text) =>
          updateTrip(trip.id, (t) => ({ ...t, places: t.places.map((p) => (p.id === placeId ? { ...p, more: text } : p)) }))
        }
      />
    </View>
  );
};

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', marginHorizontal: 20, marginTop: 4, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 4 },
  tab: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.ink },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  confirm: { marginHorizontal: 20, marginBottom: 8, padding: 14, gap: 10 },
  confirmText: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  picker: { marginHorizontal: 20, marginTop: 10, padding: 14, gap: 8 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, minHeight: 48 },
  pickName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  hint: { fontSize: 12, color: colors.muted },
});
