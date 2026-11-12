import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Button, Card, H2, Progress, headingFont } from '../../components/ui';
import { consensusLabel, memberProgress, rankPlaces } from '../../lib/consensus';
import { inviteLink } from '../../lib/invite';
import { copyText, shareText } from '../../lib/share';
import { uid } from '../../lib/storage';
import { syncEnabled } from '../../lib/sync';
import { useStore, type SyncStatus } from '../../store';
import { colors, memberColors } from '../../theme';
import type { Trip } from '../../types';

const statusText: Record<SyncStatus, string> = {
  local: 'Modo local: só neste aparelho',
  syncing: 'Sincronizando…',
  ok: 'Sincronizado',
  offline: 'Sem conexão: suas mudanças ficam salvas e sobem depois',
};

export const GroupTab = ({ trip, onGenerate }: { trip: Trip; onGenerate: () => void }) => {
  const { updateTrip, syncStatus, syncNow } = useStore();
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const ranked = rankPlaces(trip);
  const anyVote = ranked.some((r) => r.voters > 0);
  const status: SyncStatus = syncEnabled() ? (syncStatus[trip.id] ?? 'syncing') : 'local';

  const link = inviteLink(trip.code);
  const report = (r: 'copied' | 'shared' | 'failed', what: string) =>
    setNotice(r === 'copied' ? `${what} copiado.` : r === 'failed' ? `Não deu para copiar. O código é ${trip.code}.` : '');

  const copyCode = async () => report(await copyText(trip.code), 'Código');
  const copyLink = async () => report(await copyText(link), 'Link');
  const invite = async () => {
    const r = await shareText(`Bora planejar ${trip.destination} comigo? Entre por este link: ${link}\nOu abra o app e use o código ${trip.code}.`);
    report(r, 'Convite');
  };

  const addLocal = () => {
    const n = name.trim();
    if (!n) return;
    const id = uid();
    const used = new Set(trip.members.map((m) => m.color));
    const color = memberColors.find((c) => !used.has(c)) ?? memberColors[trip.members.length % memberColors.length];
    updateTrip(trip.id, (t) => ({
      ...t,
      members: [...t.members, { id, name: n, color }],
      localMemberIds: [...t.localMemberIds, id],
    }));
    setName('');
  };

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.codeCard}>
        <Text style={s.codeLabel}>Código de convite</Text>
        <Text style={s.code} selectable>
          {trip.code}
        </Text>
        <View style={s.codeActions}>
          <Button label="Copiar código" kind="outline" small onPress={() => void copyCode()} style={s.codeBtn} />
          <Button label="Copiar link" kind="outline" small onPress={() => void copyLink()} style={s.codeBtn} />
          {Platform.OS !== 'web' && <Button label="Enviar" kind="outline" small onPress={() => void invite()} style={s.codeBtn} />}
        </View>
        {!syncEnabled() && (
          <Text style={s.codeWarn}>
            O app está em modo local: o código ainda não funciona em outro aparelho. Ligue a sincronização para convidar.
          </Text>
        )}
      </View>
      <View style={s.statusRow}>
        <Text style={s.muted}>{statusText[status]}</Text>
        {status === 'offline' && <Button label="Tentar agora" kind="ghost" small onPress={() => void syncNow(trip.id)} />}
      </View>
      {notice ? <Text style={s.muted}>{notice}</Text> : null}

      <Card style={{ padding: 14, gap: 12 }}>
        {trip.members.map((m) => {
          const p = memberProgress(trip, m.id);
          return (
            <View key={m.id} style={s.memberRow}>
              <Avatar member={m} />
              <Text style={s.memberName} numberOfLines={1}>
                {m.name}
              </Text>
              <Progress value={p.total ? p.done / p.total : 0} color={m.color} />
              <Text style={s.memberCount}>
                {p.done}/{p.total}
              </Text>
            </View>
          );
        })}
        <View style={s.addRow}>
          <TextInput
            accessibilityLabel="Nome de quem vai votar neste aparelho"
            value={name}
            onChangeText={setName}
            placeholder="Nome de quem vota aqui"
            placeholderTextColor={colors.muted}
            style={s.input}
            maxLength={20}
            onSubmitEditing={addLocal}
          />
          <Button label="Adicionar" kind="dark" small disabled={!name.trim()} onPress={addLocal} />
        </View>
        <Text style={s.hint}>Sem internet? Passe o celular: cada pessoa vota no próprio nome.</Text>
      </Card>

      <H2>Consenso do grupo</H2>
      {!anyVote ? (
        <Text style={s.muted}>Ainda não há votos. O ranking aparece assim que alguém votar.</Text>
      ) : (
        ranked
          .filter((r) => r.voters > 0)
          .slice(0, 12)
          .map((r, i) => {
            const pct = Math.round(r.approval * 100);
            const strong = pct === 100;
            return (
              <Card key={r.place.id} style={s.rankRow}>
                <Text style={s.rankNum}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.rankName}>{r.place.name}</Text>
                  <Text style={s.muted}>{consensusLabel(r, trip.members.length)}</Text>
                </View>
                <View style={[s.pct, strong && { backgroundColor: colors.blueTint }]}>
                  <Text style={[s.pctText, strong && { color: colors.blue }]}>{pct}%</Text>
                </View>
              </Card>
            );
          })
      )}
      <Button label={trip.itinerary ? 'Gerar roteiro de novo' : 'Gerar roteiro'} disabled={!anyVote} onPress={onGenerate} />
      {!anyVote && <Text style={s.hint}>Vote em pelo menos um lugar para gerar o roteiro.</Text>}
    </ScrollView>
  );
};

const s = StyleSheet.create({
  scroll: { padding: 20, gap: 12, paddingBottom: 32 },
  codeCard: { backgroundColor: colors.ink, borderRadius: 20, padding: 16 },
  codeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  codeBtn: { borderWidth: 0, flexGrow: 1 },
  codeWarn: { fontSize: 12, lineHeight: 17, color: '#FFD9C7', marginTop: 10 },
  codeLabel: { fontSize: 12, color: '#D5DAE6' },
  code: { fontFamily: headingFont, fontSize: 30, fontWeight: '700', letterSpacing: 4, color: colors.white, marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 },
  muted: { fontSize: 13, color: colors.muted },
  hint: { fontSize: 12, color: colors.muted },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberName: { fontSize: 14, fontWeight: '600', color: colors.ink, width: 72 },
  memberCount: { fontSize: 13, color: colors.muted, width: 44, textAlign: 'right' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.muted,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.ink,
  },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16 },
  rankNum: { fontFamily: headingFont, fontSize: 18, fontWeight: '700', color: colors.muted, width: 24 },
  rankName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  pct: { backgroundColor: colors.bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  pctText: { fontFamily: headingFont, fontSize: 16, fontWeight: '700', color: colors.ink },
});
