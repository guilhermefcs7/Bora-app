import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BasePicker } from '../../components/BasePicker';
import { DayMap } from '../../components/DayMap';
import { Icon } from '../../components/Icon';
import { PlacePhoto } from '../../components/PlacePhoto';
import { Button, Card, Chip, H2, IconButton } from '../../components/ui';
import { distanceKm, kmLabel, travel } from '../../lib/geo';
import {
  clockLabel,
  itineraryChanges,
  itineraryPlaces,
  itineraryText,
  loopKm,
  optimizeRoute,
  reorganize,
  scheduleDay,
  type ItineraryChange,
} from '../../lib/itinerary';
import { openMaps, shareText } from '../../lib/share';
import { useStore } from '../../store';
import { catInfo, colors, durLabel } from '../../theme';
import type { Place, Trip } from '../../types';

const legText = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
  const km = distanceKm(from, to);
  const t = travel(km);
  return `${t.minutes} min ${t.mode} · ${kmLabel(km)}`;
};

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
  const [plan, setPlan] = useState<{ next: string[][]; change: ItineraryChange } | null>(null);

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
    const before = loopKm(stops, trip.base);
    const best = optimizeRoute(stops, trip.base);
    const after = loopKm(best, trip.base);
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

  const locked = new Set(trip.locked ?? []);
  const toggleLock = (id: string) =>
    updateTrip(
      trip.id,
      (t) => {
        const cur = new Set(t.locked ?? []);
        if (cur.has(id)) cur.delete(id);
        else cur.add(id);
        return { ...t, locked: [...cur] };
      },
      true,
    );

  // monta a proposta e mostra a prévia; nada muda até a pessoa aplicar
  const proposeReorganize = () => {
    const next = reorganize(trip);
    const change = itineraryChanges(trip, next);
    const gap = (it: string[][]) => (it.length ? Math.max(...it.map((x) => x.length)) - Math.min(...it.map((x) => x.length)) : 0);
    const shorter = change.kmAfter < change.kmBefore - 0.05;
    const moreEven = gap(next) < gap(trip.itinerary ?? []);
    // só propõe o que melhora: menos deslocamento ou dias mais equilibrados
    if ((change.moves.length === 0 && change.reordered.length === 0) || (!shorter && !moreEven)) {
      setPlan(null);
      setNotice('A viagem já está bem organizada: não achei uma distribuição com menos deslocamento.');
      return;
    }
    setNotice('');
    setPlan({ next, change });
  };

  const applyPlan = () => {
    if (!plan) return;
    const saved = plan.change.kmBefore - plan.change.kmAfter;
    updateTrip(trip.id, (t) => ({ ...t, itinerary: plan.next }), true);
    setPlan(null);
    setOpen(null);
    setNotice(saved > 0.05 ? `Viagem reorganizada: ${kmLabel(saved)} a menos de deslocamento.` : 'Viagem reorganizada.');
  };

  const share = async () => {
    const r = await shareText(itineraryText(trip));
    setNotice(r === 'copied' ? 'Roteiro copiado.' : r === 'failed' ? 'Não deu para compartilhar neste aparelho.' : '');
  };

  const maps = async () => {
    const ok = await openMaps(stops, trip.base);
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

      <BasePicker trip={trip} onChange={(base) => updateTrip(trip.id, (t) => ({ ...t, base }), true)} />

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
            <DayMap stops={stops} base={trip.base} />
            <View style={s.mapInfo}>
              <Text style={s.mapInfoText}>
                {stops.length} {stops.length === 1 ? 'parada' : 'paradas'} · {kmLabel(loopKm(stops, trip.base))}
              </Text>
            </View>
          </View>

          {trip.base && (
            <Text style={s.baseLeg}>
              Saída de {trip.base.name}: {legText(trip.base, stops[0])}
            </Text>
          )}
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
                        {locked.has(st.place.id) ? ' · fixada neste dia' : ''}
                      </Text>
                    </View>
                    {locked.has(st.place.id) && <Icon name="lock" size={16} color={colors.accent} />}
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
                      <Pressable
                        accessibilityRole="switch"
                        accessibilityState={{ checked: locked.has(st.place.id) }}
                        accessibilityLabel={`Fixar ${st.place.name} neste dia`}
                        onPress={() => toggleLock(st.place.id)}
                        style={[s.lockRow, locked.has(st.place.id) && { backgroundColor: colors.accentTint, borderColor: colors.accent }]}
                      >
                        <Icon name="lock" size={18} color={locked.has(st.place.id) ? colors.accent : colors.muted} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.lockTitle}>{locked.has(st.place.id) ? 'Fixada neste dia' : 'Fixar neste dia'}</Text>
                          <Text style={s.muted}>"Reorganizar viagem" não tira paradas fixadas do dia.</Text>
                        </View>
                      </Pressable>
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
          {trip.base && (
            <Text style={s.baseLeg}>
              Volta para {trip.base.name}: {legText(stops[stops.length - 1], trip.base)}
            </Text>
          )}
        </>
      )}

      {notice ? (
        <Text accessibilityLiveRegion="polite" style={s.notice}>
          {notice}
        </Text>
      ) : null}

      {plan && (
        <Card style={s.plan}>
          <H2>Proposta de reorganização</H2>
          <Text style={s.planKm}>
            Deslocamento total: {kmLabel(plan.change.kmBefore)} → {kmLabel(plan.change.kmAfter)}
            {plan.change.kmBefore - plan.change.kmAfter > 0.05
              ? ` (${kmLabel(plan.change.kmBefore - plan.change.kmAfter)} a menos)`
              : ''}
          </Text>
          {plan.change.moves.slice(0, 8).map((m) => (
            <Text key={m.place.id} style={s.planLine}>
              {m.place.name}: dia {m.from + 1} → dia {m.to + 1}
            </Text>
          ))}
          {plan.change.moves.length > 8 && <Text style={s.muted}>e mais {plan.change.moves.length - 8} paradas mudam de dia.</Text>}
          {plan.change.reordered.length > 0 && (
            <Text style={s.planLine}>
              Só a ordem muda {plan.change.reordered.length === 1 ? 'no dia' : 'nos dias'}{' '}
              {plan.change.reordered.map((i) => i + 1).join(', ')}.
            </Text>
          )}
          {plan.change.kmAfter > plan.change.kmBefore + 0.05 && (
            <Text style={s.muted}>O deslocamento sobe um pouco, mas os dias ficam mais equilibrados.</Text>
          )}
          {locked.size > 0 && <Text style={s.muted}>Paradas fixadas continuam no dia em que estão.</Text>}
          <View style={s.btnRow}>
            <Button label="Cancelar" kind="outline" small onPress={() => setPlan(null)} style={{ flex: 1 }} />
            <Button label="Aplicar" small onPress={applyPlan} style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      <Button label="Reorganizar viagem" onPress={proposeReorganize} disabled={days.flat().length < 2} />
      <Text style={s.muted}>
        Redistribui as paradas entre os dias para juntar o que fica perto. Mostra a proposta antes de mudar qualquer coisa.
      </Text>
      <View style={s.btnRow}>
        <Button label="Otimizar ordem" kind="outline" onPress={optimize} disabled={stops.length < (trip.base ? 2 : 3)} style={{ flex: 1 }} />
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
  baseLeg: { fontSize: 12, color: colors.ink, fontWeight: '600', paddingLeft: 54 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line, minHeight: 48 },
  lockTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  plan: { padding: 14, gap: 6, borderRadius: 16, borderColor: colors.accent, borderWidth: 1.5 },
  planKm: { fontSize: 14, fontWeight: '700', color: colors.ink },
  planLine: { fontSize: 13, lineHeight: 19, color: colors.body },
});
