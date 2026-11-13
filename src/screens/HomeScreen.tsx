import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '../components/Icon';
import { SwipeRow } from '../components/SwipeRow';
import { Avatar, Button, Card, Chip, H1, H2, IconButton, Progress, Tag, headingFont } from '../components/ui';
import { memberProgress } from '../lib/consensus';
import { syncEnabled } from '../lib/sync';
import { useNav } from '../nav';
import { useStore } from '../store';
import { allInterests, interestInfo } from '../lib/audience';
import { activitiesLabel, catInfo, colors, memberColors, perDayOf } from '../theme';
import type { Trip } from '../types';

const bannerColors = [colors.ink, colors.teal, colors.blue, '#7C3AED', '#BE185D'];

const TripCard = ({ trip, index, meId, onOpen }: { trip: Trip; index: number; meId: string; onOpen: () => void }) => {
  const { done, total } = memberProgress(trip, meId);
  // capa: foto do destino; em viagens antigas, a primeira foto de lugar que houver
  const cover = trip.cover ?? trip.places.find((p) => p.img)?.img;
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir viagem ${trip.destination}`} onPress={onOpen}>
      <Card style={{ overflow: 'hidden' }}>
        <View style={[s.banner, { backgroundColor: bannerColors[index % bannerColors.length] }]}>
          {cover && !coverFailed ? (
            <>
              <Image source={{ uri: cover }} resizeMode="cover" onError={() => setCoverFailed(true)} style={s.bannerImg} accessibilityLabel={`Foto de ${trip.destination}`} />
              <View style={s.bannerShade} />
            </>
          ) : null}
          <Text style={s.bannerTitle}>{trip.destination}</Text>
          <Text style={s.bannerSub}>
            {trip.days} {trip.days === 1 ? 'dia' : 'dias'} · {activitiesLabel(perDayOf(trip))} por dia
          </Text>
        </View>
        <View style={s.cardBody}>
          <View style={s.row}>
            <View style={{ flexDirection: 'row' }}>
              {trip.members.slice(0, 4).map((m, i) => (
                <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                  <Avatar member={m} size={30} ring />
                </View>
              ))}
            </View>
            <Text style={s.muted}>
              {trip.members.length} {trip.members.length === 1 ? 'pessoa' : 'pessoas'}
            </Text>
            <View style={{ flex: 1 }} />
            {trip.itinerary ? (
              <View style={s.ready}>
                <Text style={s.readyText}>Roteiro pronto</Text>
              </View>
            ) : (
              <Text style={s.strong}>
                {done} de {total} votados
              </Text>
            )}
          </View>
          {!trip.itinerary && <View style={{ flexDirection: 'row' }}><Progress value={total ? done / total : 0} /></View>}
        </View>
      </Card>
    </Pressable>
  );
};

export const Welcome = ({ invited }: { invited?: boolean }) => {
  const { setProfile } = useStore();
  const [name, setName] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  return (
    <View style={s.welcome}>
      <Text style={s.logo}>Bora</Text>
      <H1>{invited ? 'Você foi convidado para uma viagem.' : 'Viagem em grupo sem discussão.'}</H1>
      <Text style={s.lead}>Cada um dá swipe nos lugares. O app mostra o que o grupo quer e monta o roteiro.</Text>
      <Text style={s.label}>Como te chamamos?</Text>
      <TextInput
        accessibilityLabel="Seu nome"
        value={name}
        onChangeText={setName}
        placeholder="Seu nome"
        placeholderTextColor={colors.muted}
        style={s.input}
        maxLength={20}
        returnKeyType="done"
      />
      <Text style={s.label}>O que você curte em viagem? (opcional)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {allInterests.map((i) => (
          <Chip
            key={i}
            label={interestInfo[i].label}
            active={interests.includes(i)}
            onPress={() => setInterests((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))}
          />
        ))}
      </View>
      <Button label="Começar" disabled={!name.trim()} onPress={() => setProfile({ name: name.trim(), interests })} />
    </View>
  );
};

export const HomeScreen = () => {
  const { profile, setProfile, trips, saved, toggleSaved, deleteTrip } = useStore();
  const nav = useNav();
  const [tab, setTab] = useState<'viagens' | 'salvos' | 'perfil'>('viagens');
  const [name, setName] = useState(profile.name);
  useEffect(() => setName(profile.name), [profile.name]);


  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {tab === 'viagens' && (
          <>
            <View style={s.top}>
              <View style={{ flex: 1 }}>
                <Text style={s.muted}>Olá, {profile.name}</Text>
                <H1>Minhas viagens</H1>
              </View>
              <Avatar member={profile} size={44} />
            </View>
            <View style={s.actions}>
              <Button label="Nova viagem" onPress={() => nav.push({ name: 'new' })} style={{ flex: 1 }} />
              <Button label="Usar código" kind="outline" onPress={() => nav.push({ name: 'join' })} style={{ flex: 1 }} />
            </View>
            {trips.length === 0 ? (
              <Card style={s.empty}>
                <H2>Nenhuma viagem ainda</H2>
                <Text style={s.lead}>Crie a primeira: escolha o destino, vote nos lugares e gere o roteiro.</Text>
              </Card>
            ) : (
              trips.map((t, i) => (
                <SwipeRow key={t.id} label={`viagem ${t.destination}`} onDelete={() => deleteTrip(t.id)}>
                  <TripCard trip={t} index={i} meId={profile.id} onOpen={() => nav.push({ name: 'trip', id: t.id })} />
                </SwipeRow>
              ))
            )}
            <View style={s.note}>
              <Icon name="check" size={20} color={colors.blue} />
              <Text style={s.noteText}>Viagens ficam salvas no aparelho e abrem sem internet. Para excluir uma, arraste o cartão para a esquerda.</Text>
            </View>
          </>
        )}

        {tab === 'salvos' && (
          <>
            <H1 style={{ marginBottom: 6 }}>Salvos</H1>
            {saved.length === 0 ? (
              <Card style={s.empty}>
                <H2>Nada salvo ainda</H2>
                <Text style={s.lead}>Toque no marcador durante a votação para guardar um lugar aqui.</Text>
              </Card>
            ) : (
              saved.map((p) => (
                <Card key={p.id} style={s.savedRow}>
                  <View style={[s.savedIcon, { backgroundColor: catInfo[p.cat].color }]}>
                    <Icon name={p.cat} size={22} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.strong}>{p.name}</Text>
                    <Text style={s.muted}>
                      {p.destination} · {catInfo[p.cat].label}
                    </Text>
                  </View>
                  <IconButton icon="trash" label={`Remover ${p.name} dos salvos`} onPress={() => toggleSaved(p, p.destination)} border={false} bg="transparent" color={colors.muted} />
                </Card>
              ))
            )}
          </>
        )}

        {tab === 'perfil' && (
          <>
            <H1 style={{ marginBottom: 6 }}>Perfil</H1>
            <Card style={{ padding: 16, gap: 12 }}>
              <Text style={s.label}>Nome</Text>
              <TextInput
                accessibilityLabel="Seu nome"
                value={name}
                onChangeText={setName}
                onBlur={() => name.trim() && setProfile({ name: name.trim() })}
                style={s.input}
                maxLength={20}
              />
              <Text style={s.label}>Cor</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {memberColors.map((c) => (
                  <Pressable
                    key={c}
                    accessibilityRole="button"
                    accessibilityLabel={`Cor ${c}`}
                    accessibilityState={{ selected: profile.color === c }}
                    onPress={() => setProfile({ color: c })}
                    style={[s.swatch, { backgroundColor: c }, profile.color === c && s.swatchOn]}
                  >
                    {profile.color === c && <Icon name="check" size={20} color={colors.white} stroke={3} />}
                  </Pressable>
                ))}
              </View>
            </Card>
            <Card style={{ padding: 16, gap: 10 }}>
              <H2>Seus interesses</H2>
              <Text style={s.lead}>Marque o que você curte. Os lugares que combinam aparecem destacados na votação.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {allInterests.map((i) => {
                  const on = (profile.interests ?? []).includes(i);
                  return (
                    <Chip
                      key={i}
                      label={interestInfo[i].label}
                      active={on}
                      onPress={() =>
                        setProfile({
                          interests: on ? (profile.interests ?? []).filter((x) => x !== i) : [...(profile.interests ?? []), i],
                        })
                      }
                    />
                  );
                })}
              </View>
            </Card>
            <Card style={{ padding: 16, gap: 8 }}>
              <H2>Sincronização do grupo</H2>
              <Tag label={syncEnabled() ? 'Supabase conectado' : 'Modo local'} />
              <Text style={s.lead}>
                {syncEnabled()
                  ? 'Viagens são sincronizadas em tempo real com quem entrar pelo código.'
                  : 'Sem servidor configurado. Tudo funciona neste aparelho e o grupo pode votar passando o celular. Para sincronizar entre aparelhos, preencha o .env com as chaves do Supabase.'}
              </Text>
            </Card>
          </>
        )}
      </ScrollView>

      <View style={s.tabbar}>
        {(
          [
            ['viagens', 'Viagens'],
            ['salvos', 'Salvos'],
            ['perfil', 'Perfil'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={s.tabBtn}
          >
            <Text style={[s.tabText, tab === key && { color: colors.accent, fontWeight: '700' }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  scroll: { padding: 20, gap: 14, paddingBottom: 32 },
  top: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 12 },
  banner: { height: 132, padding: 16, justifyContent: 'flex-end', overflow: 'hidden' },
  bannerImg: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' },
  bannerShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(20,33,61,0.5)' },
  bannerTitle: { fontFamily: headingFont, fontSize: 24, fontWeight: '700', color: colors.white },
  bannerSub: { fontSize: 13, color: '#E3E6EC', marginTop: 2 },
  cardBody: { padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  muted: { fontSize: 13, color: colors.muted },
  strong: { fontSize: 14, fontWeight: '600', color: colors.ink },
  ready: { backgroundColor: colors.blueTint, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  readyText: { fontSize: 13, fontWeight: '600', color: colors.blue },
  empty: { padding: 20, gap: 6 },
  lead: { fontSize: 15, lineHeight: 22, color: colors.body },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.blueTint },
  noteText: { fontSize: 13, color: colors.ink, flex: 1 },
  tabbar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  tabBtn: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 13, fontWeight: '500', color: colors.muted },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  savedIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  welcome: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  logo: { fontFamily: headingFont, fontSize: 22, fontWeight: '700', color: colors.accent },
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
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 3, borderColor: colors.white },
});
