import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { interestInfo, matchInterests, profileOf } from '../lib/audience';
import { loadMore, wikiUrl } from '../lib/places';
import { catInfo, colors, durLabel } from '../theme';
import type { Place } from '../types';
import { PlacePhoto } from './PlacePhoto';
import { Button, H2, IconButton, Tag, headingFont } from './ui';

type Props = {
  place: Place | null;
  myInterests?: string[];
  onClose: () => void;
  /** guarda o texto lido para abrir offline depois */
  onLoaded?: (placeId: string, text: string) => void;
};

/** Ficha completa do lugar: foto, para quem é, por que ir e o texto do "ler mais". */
export const PlaceDetail = ({ place, myInterests, onClose, onLoaded }: Props) => {
  const [state, setState] = useState<'idle' | 'loading' | 'none'>('idle');
  const [text, setText] = useState<string | null>(null);
  const id = place?.id;

  useEffect(() => {
    if (!place) return;
    setText(place.more ?? null);
    if (place.more || (!place.wikiPt && !place.wikiEn)) {
      setState(place.more ? 'idle' : 'none');
      return;
    }
    let alive = true;
    setState('loading');
    void loadMore(place).then((r) => {
      if (!alive) return;
      if (r) {
        setText(r.text);
        setState('idle');
        onLoaded?.(place.id, r.text);
      } else setState('none');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!place) return null;
  const profile = profileOf(place);
  const matches = matchInterests(place, myInterests);
  const url = wikiUrl(place);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable accessibilityLabel="Fechar" style={s.dismiss} onPress={onClose} />
        <View style={s.sheet}>
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <PlacePhoto place={place} style={s.photo} iconSize={88} />
            <View style={s.close}>
              <IconButton icon="x" label="Fechar" onPress={onClose} />
            </View>
            <View style={s.body}>
              <Text style={s.cat}>{catInfo[place.cat].label.toUpperCase()}</Text>
              <Text accessibilityRole="header" style={s.title}>
                {place.name}
              </Text>
              <Text style={s.desc}>{place.desc}</Text>
              <View style={s.tags}>
                <Tag label={`cerca de ${durLabel(place.dur)} de visita`} />
                {place.far ? <Tag label={`a ${place.far} km do centro`} /> : null}
              </View>

              {matches.length > 0 && (
                <View style={s.match}>
                  <Text style={s.matchText}>
                    Combina com seus interesses: {matches.map((i) => interestInfo[i].label).join(', ')}
                  </Text>
                </View>
              )}

              <H2 style={s.h}>Por que ir</H2>
              <Text style={s.p}>{profile.pitch}</Text>

              <H2 style={s.h}>Mais recomendado para</H2>
              <View style={s.tags}>
                {profile.audience.map((a) => (
                  <View key={a} style={s.aud}>
                    <Text style={s.audText}>{a}</Text>
                  </View>
                ))}
              </View>

              {!place.custom && (
                <>
                  <H2 style={s.h}>Sobre o lugar</H2>
                  {state === 'loading' ? (
                    <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-start' }} />
                  ) : text ? (
                    <Text style={s.p}>{text}</Text>
                  ) : (
                    <Text style={s.muted}>Não foi possível carregar mais detalhes agora.</Text>
                  )}
                  {url && (
                    <Button
                      label="Abrir artigo na Wikipédia"
                      kind="outline"
                      small
                      style={{ marginTop: 14, alignSelf: 'flex-start' }}
                      onPress={() => void Linking.openURL(url).catch(() => {})}
                    />
                  )}
                  <Text style={[s.muted, { marginTop: 12 }]}>
                    Foto e texto: Wikipédia e Wikimedia Commons. O perfil do lugar é uma sugestão automática por categoria.
                  </Text>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,33,61,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
  dismiss: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  sheet: { width: '100%', maxWidth: 480, maxHeight: '90%', backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  photo: { height: 230 },
  close: { position: 'absolute', right: 14, top: 14 },
  body: { padding: 20 },
  cat: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: colors.muted },
  title: { fontFamily: headingFont, fontSize: 26, fontWeight: '700', color: colors.ink, marginTop: 4 },
  desc: { fontSize: 15, lineHeight: 22, color: colors.body, marginTop: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  match: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: colors.accentTint },
  matchText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  h: { marginTop: 22, marginBottom: 2 },
  p: { fontSize: 15, lineHeight: 23, color: colors.body, marginTop: 6 },
  aud: { backgroundColor: colors.blueTint, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  audText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  muted: { fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 6 },
});
