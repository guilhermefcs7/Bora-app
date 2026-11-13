import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { matchInterests, profileOf } from '../lib/audience';
import { catInfo, colors, durLabel } from '../theme';
import type { Member, Place, VoteValue } from '../types';
import { Icon } from './Icon';
import { PlacePhoto } from './PlacePhoto';
import { Avatar, Tag, headingFont } from './ui';

const THRESHOLD = 96;
const OUT = 520;

export type SwipeCardHandle = { fling: (v: VoteValue) => void };

/** Selo da categoria. Tocar abre a dica "por que ir" daquele tipo de lugar. */
export const CategoryTip = ({ place, light }: { place: Pick<Place, 'cat' | 'kind'>; light?: boolean }) => {
  const [open, setOpen] = useState(false);
  const info = catInfo[place.cat];
  return (
    <View style={s.tipWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${info.label}. Toque para ver por que ir`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        hitSlop={8}
        style={[s.catBadge, light && { backgroundColor: colors.bg }]}
      >
        <Text style={s.catText}>{info.label.toUpperCase()}</Text>
        <View style={s.tipDot}>
          <Text style={s.tipDotText}>{open ? '×' : 'i'}</Text>
        </View>
      </Pressable>
      {open && (
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar dica" onPress={() => setOpen(false)} style={s.tipBubble}>
          <Text style={s.tipTitle}>Por que ir</Text>
          <Text style={s.tipText}>{profileOf(place).pitch}</Text>
        </Pressable>
      )}
    </View>
  );
};

const CardFace = ({
  place,
  approvers,
  myInterests,
  onMore,
}: {
  place: Place;
  approvers: Member[];
  myInterests?: string[];
  onMore?: () => void;
}) => {
  const matches = matchInterests(place, myInterests);
  // altura do cartão varia muito entre celular e desktop: o texto se ajusta para nada ficar cortado
  const [h, setH] = useState(0);
  const lines = h === 0 ? 3 : h < 380 ? 2 : h < 470 ? 3 : h < 560 ? 4 : 6;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver detalhes de ${place.name}`}
      disabled={!onMore}
      onPress={onMore}
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      style={s.face}
    >
      <View style={s.art}>
        <PlacePhoto place={place} style={s.photo} iconSize={96} />
        <View style={s.tipPos}>
          <CategoryTip place={place} />
        </View>
        {matches.length > 0 && (
          <View style={s.matchBadge}>
            <Text style={s.matchText}>Combina com você</Text>
          </View>
        )}
        {onMore && (
          <View style={s.detailsPill}>
            <Text style={s.detailsText}>Ver detalhes</Text>
            <Icon name="up" size={14} color={colors.white} stroke={2.6} />
          </View>
        )}
      </View>
      <View style={s.body}>
        <Text style={s.title} numberOfLines={2}>
          {place.name}
        </Text>
        <Text style={s.desc} numberOfLines={lines}>
          {place.more ?? place.desc}
        </Text>
        <View style={s.tags}>
          <Tag label={`cerca de ${durLabel(place.dur)}`} />
          {place.far ? <Tag label={`a ${place.far} km do centro`} /> : <Tag label="no centro" />}
          {approvers.length > 0 && (
            <View style={s.approvers}>
              {approvers.slice(0, 3).map((m) => (
                <Avatar key={m.id} member={m} size={22} />
              ))}
              <Text style={s.approversText} numberOfLines={1}>
                {approvers.length === 1 ? `${approvers[0].name} aprovou` : `${approvers.length} aprovaram`}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

/** Cartão do topo: acompanha o dedo e decide o voto ao soltar. */
const TopCard = forwardRef<
  SwipeCardHandle,
  { place: Place; approvers: Member[]; myInterests?: string[]; onMore: () => void; onVote: (v: VoteValue) => void }
>(({ place, approvers, myInterests, onMore, onVote }, ref) => {
    const pos = useRef(new Animated.ValueXY()).current;
    const busy = useRef(false);
    // na web, soltar um arrasto ainda dispara o clique do cartão: este marcador evita abrir os detalhes
    const dragged = useRef(false);
    const endDrag = () => setTimeout(() => (dragged.current = false), 250);
    const onVoteRef = useRef(onVote);
    onVoteRef.current = onVote;

    const fling = (v: VoteValue) => {
      if (busy.current) return;
      busy.current = true;
      const to = v === 2 ? { x: 0, y: -OUT * 1.4 } : { x: v === 1 ? OUT : -OUT, y: 40 };
      Animated.timing(pos, { toValue: to, duration: 190, useNativeDriver: false }).start(() => onVoteRef.current(v));
    };
    useImperativeHandle(ref, () => ({ fling }));

    const pan = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onMoveShouldSetPanResponder: (_, g) => !busy.current && (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6),
          onPanResponderGrant: () => {
            dragged.current = true;
          },
          onPanResponderMove: (_, g) => pos.setValue({ x: g.dx, y: g.dy }),
          onPanResponderRelease: (_, g) => {
            endDrag();
            // velocidade também conta: um peteleco curto vale como swipe
            if (g.dx > THRESHOLD || (g.vx > 0.8 && g.dx > 30)) fling(1);
            else if (g.dx < -THRESHOLD || (g.vx < -0.8 && g.dx < -30)) fling(-1);
            else if (g.dy < -THRESHOLD && Math.abs(g.dx) < THRESHOLD) fling(2);
            else Animated.spring(pos, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start();
          },
          onPanResponderTerminate: () => {
            endDrag();
            Animated.spring(pos, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start();
          },
        }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const rotate = pos.x.interpolate({ inputRange: [-OUT, 0, OUT], outputRange: ['-18deg', '0deg', '18deg'] });
    const likeO = pos.x.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
    const nopeO = pos.x.interpolate({ inputRange: [-THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });
    const superO = pos.y.interpolate({ inputRange: [-THRESHOLD, -20], outputRange: [1, 0], extrapolate: 'clamp' });

    return (
      <Animated.View
        {...pan.panHandlers}
        style={[s.card, { transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] }]}
      >
        <CardFace
          place={place}
          approvers={approvers}
          myInterests={myInterests}
          onMore={() => {
            if (!dragged.current && !busy.current) onMore();
          }}
        />
        <Animated.View pointerEvents="none" style={[s.stamp, s.stampRight, { opacity: likeO, borderColor: colors.white }]}>
          <Text style={s.stampText}>BORA</Text>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[s.stamp, s.stampLeft, { opacity: nopeO, borderColor: colors.white }]}>
          <Text style={s.stampText}>PASSO</Text>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[s.stamp, s.stampCenter, { opacity: superO, borderColor: colors.white }]}>
          <Text style={s.stampText}>IMPERDÍVEL</Text>
        </Animated.View>
      </Animated.View>
    );
});

export const SwipeDeck = forwardRef<
  SwipeCardHandle,
  {
    current: Place;
    next?: Place;
    myInterests?: string[];
    approversOf: (p: Place) => Member[];
    onMore: (p: Place) => void;
    onVote: (p: Place, v: VoteValue) => void;
  }
>(({ current, next, myInterests, approversOf, onMore, onVote }, ref) => (
  <View style={s.deck}>
    {next && (
      <View style={[s.card, s.under]} pointerEvents="none">
        <CardFace place={next} approvers={[]} />
      </View>
    )}
    {/* key por lugar: cada cartão nasce com posição zerada */}
    <TopCard
      key={current.id}
      ref={ref}
      place={current}
      approvers={approversOf(current)}
      myInterests={myInterests}
      onMore={() => onMore(current)}
      onVote={(v) => onVote(current, v)}
    />
  </View>
));

const s = StyleSheet.create({
  deck: { flex: 1, marginHorizontal: 20, marginVertical: 14 },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  under: { transform: [{ scale: 0.95 }, { translateY: 14 }] },
  face: { flex: 1 },
  art: { flex: 5, minHeight: 110 },
  detailsPill: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(20,33,61,0.88)', borderRadius: 18, paddingHorizontal: 12, height: 36 },
  detailsText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  photo: { flex: 1 },
  matchBadge: { position: 'absolute', right: 16, top: 16, backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  matchText: { fontSize: 12, fontWeight: '700', color: colors.white },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 'auto' },
  more: { height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  tipPos: { position: 'absolute', left: 16, top: 16, right: 16, zIndex: 5 },
  tipWrap: { alignItems: 'flex-start' },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.white, borderRadius: 10, paddingLeft: 10, paddingRight: 6, paddingVertical: 5 },
  tipDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  tipDotText: { color: colors.white, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  tipBubble: { marginTop: 6, maxWidth: 300, backgroundColor: colors.ink, borderRadius: 12, padding: 12 },
  tipTitle: { color: colors.white, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  tipText: { color: colors.white, fontSize: 13, lineHeight: 19 },
  catText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, color: colors.ink },
  body: { flex: 6, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, gap: 8, overflow: 'hidden' },
  title: { fontFamily: headingFont, fontSize: 22, fontWeight: '700', color: colors.ink },
  desc: { fontSize: 14, lineHeight: 20, color: colors.body },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  approvers: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.blueTint, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  approversText: { fontSize: 13, fontWeight: '600', color: colors.ink, marginLeft: 2, flexShrink: 1 },
  stamp: { position: 'absolute', top: 18, borderWidth: 3, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: 'rgba(20,33,61,0.75)' },
  stampRight: { left: 18, transform: [{ rotate: '-10deg' }], top: 60 },
  stampLeft: { right: 18, transform: [{ rotate: '10deg' }], top: 60 },
  stampCenter: { alignSelf: 'center', top: 100 },
  stampText: { fontFamily: headingFont, fontSize: 22, fontWeight: '700', color: colors.white },
});
