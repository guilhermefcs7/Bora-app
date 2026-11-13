import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DayMap } from '../../components/DayMap';
import { PlacePhoto } from '../../components/PlacePhoto';
import { Button, Card, Chip, H2, IconButton } from '../../components/ui';
import { kmLabel } from '../../lib/geo';
import { clockLabel, dayDistanceKm, itineraryPlaces, itineraryText, optimizeRoute, scheduleDay } from '../../lib/itinerary';
import { openMaps, shareText } from '../../lib/share';
import { useStore } from '../../store';
import { catInfo, colors, durLabel } from '../../theme';
import type { Place, Trip } from '../../types';

export const ItineraryTab = ({
  trip,
  onGenerate,
  onVote,
  onMore,
}: {
  trip: Trip;
  onGenerate: () => void;
  onVote: () => void;
  onMore: (p: Place) => void;
}) => {
  const { updateTrip } = useStore();
  const [day, setDay] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  if (!trip.itinerary) {
    const anyVote = Object.values(trip.votes).some((v) => Object.keys(v).length > 0);
    return (
      <View style={s.empty}>
        <H2 style={{ fontSize: 22, textAlign: 'center' }}>Roteiro ainda não gerado</H2>
        <Text style={s.emptyText}>
          {anyVote
            ? 'O roteiro usa os lugares mais votados, junta os que ficam perto e ordena cada dia pela rota mais curta.'
            : 'Vote nos lugares primeiro. O roteiro é montado a partir dos votos do grupo.'}
        </Text>
        {anyVote ? <Button label="Gerar roteiro" onPress={onGenerate} /> : <Button label="Ir para a votação" onPress={onVote} />}
      </View>
    );
  }

  const days = itineraryPlaces(trip);
  const d = Math.min(day, days.length - 1);
  const stops = days[d] ?? [];
  const schedule = scheduleDay(stops);

  const mutate = (fn: (it: string[][]) => string[][]) =>
    updateTrip(trip.id, (t) => ({ ...t, itinerary: fn((t.itinerary ?? []).map((x) => [...x])) }), true);

  const move = (id: string, delta: -1 | 1) =>
    mutate((it) => {
      const i = it[d].indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= it[d].length) return it;
      [it[d][i], it[d][j]] = [it[d][j], it[d][i]];
      return it;
    });

  const toDay = (id: string, target: number) =>
    mutate((it) => {
      if (target === d || !it[target]) return it;
      it[d] = it[d].filter((x) => x !== id);
      it[target].push(id);
      return it;
    });

  const remove = (id: string) => mutate((it) => it.map((dayIds) => dayIds.filter((x) => x !== id)));

  const optimize = () => {
    const before = dayDistanceKm(stops);
    const best = optimizeRoute(stops);
    const after = dayDistanceKm(best);
    // o roteiro já nasce otimizado: só há o que mudar depois de mover ou reordenar paradas à mão
    if (after >= before - 0.01) {
      setNotice('Este dia já está na ordem de menor deslocamento. Nada a mudar.');
      return;
    }
    const ids = best.map((p) => p.id);
    mutate((it) => {
      it[d] = ids;
      return it;
    });
    setNotice(`Dia reordenado: o deslocamento caiu de ${kmLabel(before)} para ${kmLabel(after)}.`);
  };

  const share = async () => {
    const r = await shareText(itineraryText(trip));
    setNotice(r === 'copied' ? 'Roteiro copiado.' : r === 'failed' ? 'Não deu para compartilhar neste aparelho.' : '');
  };

  const maps = async () => {
    const ok = await openMaps(stops);
    if (!ok) setNotice('Não foi possível abrir o app de mapas.');
  };

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((_, i) => (
          <Chip
            key={i}
            label={`Dia ${i + 1}${days[i].length === 0 ? ' · livre' : ''}`}
            active={i === d}
            onPress={() => {
              setDay(i);
              setOpen(null);
              setNotice('');
            }}
          />
        ))}
      </ScrollView>

      {stops.length === 0 ? (
        <Card style={{ padding: 20, gap: 6 }}>
          <H2>Dia livre</H2>
          <Text style={s.muted}>
            Há menos lugares aprovados do que dias de viagem. Abra uma parada de outro dia e use "Mover para outro dia", ou aprove mais lugares na votação e gere de novo.
          </Text>
        </Card>
      ) : (
        <>
          <View>
            <DayMap stops={stops} />
            <View style={s.mapInfo}>
              <Text style={s.mapInfoText}>
                {stops.length} {stops.length === 1 ? 'parada' : 'paradas'} · {kmLabel(dayDistanceKm(stops))}
              </Text>
            </View>
          </View>

          {schedule.map((st, i) => (
            <View key={st.place.id}>
              <View style={s.stopRow}>
                <View style={s.time}>
                  <Text style={s.timeText}>{clockLabel(st.start)}</Text>
                  <View style={s.rail} />
                </View>
                <Card style={s.stopCard}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Editar parada ${st.place.name}`}
                    accessibilityState={{ expanded: open === st.place.id }}
                    onPress={() => setOpen(open === st.place.id ? null : st.place.id)}
                    style={s.stopHead}
                  >
                    <PlacePhoto place={st.place} style={s.thumb} iconSize={24} />
                    <View style={s.numOver}>
                      <Text style={s.numText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.stopName}>{st.place.name}</Text>
                      <Text style={s.muted}>
                        {catInfo[st.place.cat].label} · {durLabel(st.place.dur)}
                      </Text>
                    </View>
                    <Text style={s.more}>{open === st.place.id ? 'Fechar' : 'Editar'}</Text>
                  </Pressable>
                  {open === st.place.id && (
                    <View style={s.tools}>
                      <View style={s.toolRow}>
                        <IconButton icon="up" label="Mover para cima" onPress={() => move(st.place.id, -1)} disabled={i === 0} />
                        <IconButton icon="down" label="Mover para baixo" onPress={() => move(st.place.id, 1)} disabled={i === stops.length - 1} />
                        <Button label="Ver detalhes" kind="outline" small onPress={() => onMore(st.place)} />
                        <View style={{ flex: 1 }} />
                        <IconButton icon="trash" label={`Remover ${st.place.name} do roteiro`} onPress={() => remove(st.place.id)} color="#B91C1C" />
                      </View>
                      {days.length > 1 && (
                        <>
                          <Text style={s.moveLabel}>Mover para outro dia</Text>
                          <View accessibilityRole="radiogroup" style={s.dayGrid}>
                            {days.map((dayStops, target) =>
                              target === d ? null : (
                                <Pressable
                                  key={target}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Mover ${st.place.name} para o dia ${target + 1}`}
                                  onPress={() => {
                                    toDay(st.place.id, target);
                                    setOpen(null);
                                    setNotice(`${st.place.name} foi para o dia ${target + 1}.`);
                                  }}
                                  style={({ pressed }) => [s.dayBtn, pressed && { backgroundColor: colors.blueTint }]}
                                >
                                  <Text style={s.dayBtnTitle}>Dia {target + 1}</Text>
                                  <Text style={s.dayBtnSub}>
                                    {dayStops.length === 0 ? 'livre' : `${dayStops.length} ${dayStops.length === 1 ? 'parada' : 'paradas'}`}
                                  </Text>
                                </Pressable>
                              ),
                            )}
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </Card>
              </View>
              {st.next && (
                <Text style={s.leg}>
                  {st.next.minutes} min {st.next.mode} · {kmLabel(st.next.km)}
                </Text>
              )}
            </View>
          ))}
        </>
      )}

      {notice ? (
        <Text accessibilityLiveRegion="polite" style={s.notice}>
          {notice}
        </Text>
      ) : null}

      <View style={s.btnRow}>
        <Button label="Otimizar ordem" kind="outline" onPress={optimize} disabled={stops.length < 3} style={{ flex: 1 }} />
        <Button label="Abrir no mapa" kind="dark" onPress={() => void maps()} disabled={stops.length === 0} style={{ flex: 1 }} />
      </View>
      <View style={s.btnRow}>
        <Button label="Compartilhar" kind="outline" onPress={() => void share()} style={{ flex: 1 }} />
        <Button label="Gerar de novo" kind="outline" onPress={onGenerate} style={{ flex: 1 }} />
      </View>
      <Text style={s.muted}>Horários e deslocamentos são estimativas em linha reta ajustada, não rotas reais.</Text>
    </ScrollView>
  );
};

const s = StyleSheet.create({
  scroll: { padding: 20, gap: 12, paddingBottom: 32 },
  empty: { flex: 1, padding: 28, justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 15, lineHeight: 22, color: colors.body, textAlign: 'center' },
  muted: { fontSize: 12, color: colors.muted },
  mapInfo: { position: 'absolute', left: 12, bottom: 10, backgroundColor: colors.surface, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 },
  mapInfoText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  stopRow: { flexDirection: 'row', gap: 10 },
  time: { width: 44, alignItems: 'center' },
  timeText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  rail: { width: 2, flex: 1, backgroundColor: '#C9CFDA', marginTop: 4 },
  stopCard: { flex: 1, borderRadius: 16, marginBottom: 6 },
  stopHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 60 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  numOver: { position: 'absolute', left: 6, top: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  numText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  stopName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  more: { fontSize: 13, fontWeight: '600', color: colors.blue },
  tools: { padding: 12, paddingTop: 0, gap: 10 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moveLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayBtn: { minWidth: 72, minHeight: 48, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dayBtnTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  dayBtnSub: { fontSize: 11, color: colors.muted },
  leg: { fontSize: 12, color: colors.muted, paddingLeft: 54, marginBottom: 6 },
  notice: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 10 },
});
