import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { Button, Card, IconButton } from '../../components/ui';
import { uid } from '../../lib/storage';
import { useStore } from '../../store';
import { colors } from '../../theme';
import type { Trip } from '../../types';

export const ChecklistTab = ({ trip }: { trip: Trip }) => {
  const { updateTrip } = useStore();
  const [text, setText] = useState('');
  const done = trip.checklist.filter((c) => c.done).length;

  const add = () => {
    const t = text.trim();
    if (!t) return;
    updateTrip(trip.id, (tr) => ({ ...tr, checklist: [...tr.checklist, { id: uid(), text: t, done: false }] }), true);
    setText('');
  };
  const toggle = (id: string) =>
    updateTrip(trip.id, (tr) => ({ ...tr, checklist: tr.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) }), true);
  const remove = (id: string) =>
    updateTrip(trip.id, (tr) => ({ ...tr, checklist: tr.checklist.filter((c) => c.id !== id) }), true);

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <Text style={s.muted}>
        {done} de {trip.checklist.length} itens prontos
      </Text>
      {trip.checklist.map((c) => (
        <Card key={c.id} style={s.row}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: c.done }}
            accessibilityLabel={c.text}
            onPress={() => toggle(c.id)}
            style={s.rowMain}
          >
            <View style={[s.box, c.done && { backgroundColor: colors.blue, borderColor: colors.blue }]}>
              {c.done && <Icon name="check" size={16} color={colors.white} stroke={3} />}
            </View>
            <Text style={[s.text, c.done && { color: colors.muted, textDecorationLine: 'line-through' }]}>{c.text}</Text>
          </Pressable>
          <IconButton icon="trash" label={`Remover ${c.text}`} onPress={() => remove(c.id)} border={false} bg="transparent" color={colors.muted} />
        </Card>
      ))}
      <View style={s.addRow}>
        <TextInput
          accessibilityLabel="Novo item"
          value={text}
          onChangeText={setText}
          placeholder="Novo item"
          placeholderTextColor={colors.muted}
          style={s.input}
          maxLength={80}
          onSubmitEditing={add}
        />
        <Button label="Adicionar" kind="dark" small disabled={!text.trim()} onPress={add} />
      </View>
    </ScrollView>
  );
};

const s = StyleSheet.create({
  scroll: { padding: 20, gap: 10, paddingBottom: 32 },
  muted: { fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingRight: 4 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 52 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 15, color: colors.ink, flex: 1 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 },
  input: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.muted,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.ink,
  },
});
