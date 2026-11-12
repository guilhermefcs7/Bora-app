import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Header } from '../components/ui';
import { PlacesError, loadDestination, suggestDestinations, type Suggestion } from '../lib/places';
import { useNav } from '../nav';
import { useStore } from '../store';
import { MAX_PER_DAY, activitiesLabel, colors, paceLabel } from '../theme';

type SearchState = 'idle' | 'searching' | 'done' | 'error';

export const NewTripScreen = () => {
  const nav = useNav();
  const { createTrip } = useStore();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [search, setSearch] = useState<SearchState>('idle');
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [days, setDays] = useState(3);
  const [perDay, setPerDay] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  // autocomplete: espera a pessoa parar de digitar e cancela a busca anterior
  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setSuggestions([]);
      setSearch('idle');
      return;
    }
    const ctrl = new AbortController();
    setSearch('searching');
    const timer = setTimeout(async () => {
      try {
        const list = await suggestDestinations(query, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setSuggestions(list);
        setSearch('done');
      } catch {
        if (ctrl.signal.aborted) return;
        setSuggestions([]);
        setSearch('error');
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, selected]);

  const pick = (s: Suggestion) => {
    setSelected(s);
    setQuery(s.name);
    setSuggestions([]);
    setError('');
  };

  const submit = async () => {
    if (!selected) return;
    setError('');
    setBusy(true);
    try {
      const destination = await loadDestination(selected, days * perDay);
      if (!alive.current) return;
      const trip = createTrip({ destination, days, perDay });
      nav.replace({ name: 'trip', id: trip.id });
    } catch (e) {
      if (!alive.current) return;
      setBusy(false);
      setError(e instanceof PlacesError ? e.message : 'Não foi possível buscar os lugares agora. Tente de novo.');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Header title="Nova viagem" onBack={nav.back} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.block}>
          <Text style={s.label}>Para onde?</Text>
          <TextInput
            accessibilityLabel="Destino"
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setSelected(null);
              setError('');
            }}
            placeholder="Digite uma cidade ou região"
            placeholderTextColor={colors.muted}
            style={[s.input, selected && { borderColor: colors.blue, backgroundColor: colors.blueTint }]}
            autoCorrect={false}
            autoFocus
            editable={!busy}
          />
          {selected ? (
            <Text style={s.hint}>
              Selecionado: {selected.name}
              {selected.detail ? `, ${selected.detail}` : ''}
            </Text>
          ) : search === 'searching' ? (
            <View style={s.inline}>
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={s.hint}>Buscando destinos…</Text>
            </View>
          ) : search === 'error' ? (
            <Text accessibilityRole="alert" style={s.error}>
              Não foi possível buscar destinos. Verifique a internet.
            </Text>
          ) : search === 'done' && suggestions.length === 0 ? (
            <Text style={s.hint}>Nenhum destino encontrado com esse nome.</Text>
          ) : query.trim().length < 2 ? (
            <Text style={s.hint}>Digite ao menos 2 letras e escolha um destino da lista.</Text>
          ) : null}

          {suggestions.length > 0 && (
            <View accessibilityRole="list" style={s.list}>
              {suggestions.map((sg, i) => (
                <Pressable
                  key={sg.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${sg.name}${sg.detail ? `, ${sg.detail}` : ''}`}
                  onPress={() => pick(sg)}
                  style={({ pressed }) => [s.option, i > 0 && s.optionBorder, pressed && { backgroundColor: colors.bg }]}
                >
                  <Text style={s.optionName}>{sg.name}</Text>
                  {sg.detail ? <Text style={s.hint}>{sg.detail}</Text> : null}
                </Pressable>
              ))}
            </View>
          )}
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
        </View>

        <View style={s.block}>
          <Text style={s.label}>Quantos dias?</Text>
          <View style={s.stepper}>
            <Pressable accessibilityRole="button" accessibilityLabel="Menos um dia" disabled={days <= 1} onPress={() => setDays((d) => d - 1)} style={[s.stepBtn, days <= 1 && { opacity: 0.4 }]}>
              <Text style={s.stepSign}>−</Text>
            </Pressable>
            <Text style={s.stepValue}>
              {days} {days === 1 ? 'dia' : 'dias'}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Mais um dia" disabled={days >= 14} onPress={() => setDays((d) => d + 1)} style={[s.stepBtn, days >= 14 && { opacity: 0.4 }]}>
              <Text style={s.stepSign}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.block}>
          <Text style={s.label}>Quantas atividades por dia?</Text>
          <View style={s.stepper}>
            <Pressable accessibilityRole="button" accessibilityLabel="Menos uma atividade por dia" disabled={perDay <= 1} onPress={() => setPerDay((n) => n - 1)} style={[s.stepBtn, perDay <= 1 && { opacity: 0.4 }]}>
              <Text style={s.stepSign}>−</Text>
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={s.stepValue}>{activitiesLabel(perDay)}</Text>
              <Text style={s.hint}>Ritmo {paceLabel(perDay).toLowerCase()}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Mais uma atividade por dia" disabled={perDay >= MAX_PER_DAY} onPress={() => setPerDay((n) => n + 1)} style={[s.stepBtn, perDay >= MAX_PER_DAY && { opacity: 0.4 }]}>
              <Text style={s.stepSign}>+</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(
              [
                ['Leve', 3],
                ['Moderado', 4],
                ['Intenso', 6],
              ] as const
            ).map(([label, n]) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${activitiesLabel(n)} por dia`}
                accessibilityState={{ selected: perDay === n }}
                onPress={() => setPerDay(n)}
                style={[s.pace, perDay === n && s.paceOn]}
              >
                <Text style={[s.paceTitle, perDay === n && { fontWeight: '700' }]}>{label}</Text>
                <Text style={s.hint}>{activitiesLabel(n)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.hint}>
            Até {days * perDay} atividades em {days} {days === 1 ? 'dia' : 'dias'}.
            {perDay > 6 ? ' Acima de 6 por dia o roteiro fica corrido: sobra pouco tempo em cada lugar.' : ''}
          </Text>
        </View>
      </ScrollView>
      <View style={s.footer}>
        {busy ? (
          <View style={s.loading}>
            <ActivityIndicator color={colors.accent} />
            <Text style={s.hint}>Buscando lugares em {selected?.name}…</Text>
          </View>
        ) : (
          <Button label="Criar e começar a votar" disabled={!selected} onPress={() => void submit()} />
        )}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  scroll: { padding: 20, gap: 22 },
  block: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.ink,
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  list: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  option: { paddingHorizontal: 16, paddingVertical: 10, minHeight: 52, justifyContent: 'center' },
  optionBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  optionName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  hint: { fontSize: 12, color: colors.muted },
  error: { fontSize: 13, color: '#B91C1C', fontWeight: '600' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 8,
  },
  stepBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  stepSign: { fontSize: 24, color: colors.ink },
  stepValue: { fontSize: 22, fontWeight: '700', color: colors.ink },
  pace: {
    flex: 1,
    height: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  paceOn: { borderWidth: 2, borderColor: colors.accent, backgroundColor: colors.accentTint },
  paceTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  footer: { padding: 20, paddingTop: 8 },
  loading: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
});
