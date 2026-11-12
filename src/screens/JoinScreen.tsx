import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Header } from '../components/ui';
import { syncEnabled } from '../lib/sync';
import { useNav } from '../nav';
import { useStore } from '../store';
import { colors } from '../theme';

export const JoinScreen = () => {
  const nav = useNav();
  const { joinTrip } = useStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const trip = await joinTrip(code);
      nav.replace({ name: 'trip', id: trip.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg.startsWith('Nenhuma') || msg.startsWith('Para entrar') ? msg : 'Não foi possível conectar. Verifique a internet e tente de novo.');
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Header title="Entrar com código" onBack={nav.back} />
      <View style={s.body}>
        <Text style={s.lead}>Peça o código de 6 caracteres para quem criou a viagem.</Text>
        <TextInput
          accessibilityLabel="Código de convite"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="ABC123"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          style={s.input}
        />
        {!syncEnabled() && (
          <Text style={s.hint}>
            Este app está em modo local, sem servidor. Entrar por código exige o Supabase configurado (veja o README).
          </Text>
        )}
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : null}
        {busy ? <ActivityIndicator color={colors.accent} /> : <Button label="Entrar na viagem" disabled={code.length !== 6} onPress={() => void submit()} />}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  body: { padding: 20, gap: 16 },
  lead: { fontSize: 15, lineHeight: 22, color: colors.body },
  input: {
    height: 64,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 6,
    color: colors.ink,
  },
  hint: { fontSize: 13, lineHeight: 19, color: colors.muted },
  error: { fontSize: 13, color: '#B91C1C', fontWeight: '600' },
});
