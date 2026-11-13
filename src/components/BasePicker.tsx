import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { suggestSpots, type SpotSuggestion } from '../lib/places';
import { colors } from '../theme';
import type { Trip } from '../types';
import { Icon } from './Icon';
import { Button, Card } from './ui';

/** Hospedagem da viagem: o ponto de onde cada dia sai e para onde volta. */
export const BasePicker = ({
  trip,
  onChange,
}: {
  trip: Pick<Trip, 'base' | 'lat' | 'lng' | 'destination'>;
  onChange: (base: Trip['base']) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [list, setList] = useState<SpotSuggestion[]>([]);
  const [state, setState] = useState<'idle' | 'searching' | 'empty' | 'error'>('idle');

  useEffect(() => {
    if (!editing || text.trim().length < 3) {
      setList([]);
      setState('idle');
      return;
    }
    const ctrl = new AbortController();
    setState('searching');
    const timer = setTimeout(async () => {
      try {
        const r = await suggestSpots(text, trip.lat, trip.lng, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setList(r);
        setState(r.length ? 'idle' : 'empty');
      } catch {
        if (!ctrl.signal.aborted) setState('error');
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [text, editing, trip.lat, trip.lng]);

  const close = () => {
    setEditing(false);
    setText('');
    setList([]);
  };

  return (
    <Card style={s.card}>
      <View style={s.row}>
        <View style={s.badge}>
          <Icon name="home" size={18} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Hospedagem</Text>
          <Text style={s.value} numberOfLines={1}>
            {trip.base ? trip.base.name : 'Não definida'}
          </Text>
        </View>
        {!editing && <Button label={trip.base ? 'Trocar' : 'Definir'} kind="outline" small onPress={() => setEditing(true)} />}
      </View>
      {!trip.base && !editing && (
        <Text style={s.hint}>Com a hospedagem definida, cada dia começa e termina perto dela e o mapa mostra a ida e a volta.</Text>
      )}
      {editing && (
        <View style={{ gap: 8 }}>
          <TextInput
            accessibilityLabel="Buscar hospedagem"
            value={text}
            onChangeText={setText}
            placeholder="Nome da pousada, hotel ou endereço"
            placeholderTextColor={colors.muted}
            style={s.input}
            autoFocus
          />
          {state === 'searching' && <ActivityIndicator size="small" color={colors.muted} style={{ alignSelf: 'flex-start' }} />}
          {state === 'empty' && <Text style={s.hint}>Nada encontrado. Tente o nome da rua ou do bairro.</Text>}
          {state === 'error' && <Text style={s.hint}>Não foi possível buscar agora. Verifique a internet.</Text>}
          {list.length > 0 && (
            <View style={s.list}>
              {list.map((sp, i) => (
                <Pressable
                  key={sp.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${sp.name}${sp.detail ? `, ${sp.detail}` : ''}`}
                  onPress={() => {
                    onChange({ name: sp.name, lat: sp.lat, lng: sp.lng });
                    close();
                  }}
                  style={[s.option, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}
                >
                  <Text style={s.optName}>{sp.name}</Text>
                  {sp.detail ? <Text style={s.hint}>{sp.detail}</Text> : null}
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={`Usar o centro de ${trip.destination}`}
              kind="outline"
              small
              style={{ flex: 1 }}
              onPress={() => {
                onChange({ name: `Centro de ${trip.destination}`, lat: trip.lat, lng: trip.lng });
                close();
              }}
            />
            {trip.base && (
              <Button
                label="Remover"
                kind="ghost"
                small
                onPress={() => {
                  onChange(undefined);
                  close();
                }}
              />
            )}
            <Button label="Cancelar" kind="ghost" small onPress={close} />
          </View>
        </View>
      )}
    </Card>
  );
};

const s = StyleSheet.create({
  card: { padding: 12, gap: 10, borderRadius: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, color: colors.muted },
  value: { fontSize: 15, fontWeight: '600', color: colors.ink },
  hint: { fontSize: 12, lineHeight: 17, color: colors.muted },
  input: { height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.surface, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  list: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: 'hidden' },
  option: { paddingHorizontal: 12, paddingVertical: 8, minHeight: 48, justifyContent: 'center', backgroundColor: colors.surface },
  optName: { fontSize: 15, fontWeight: '600', color: colors.ink },
});
