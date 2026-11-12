import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { catInfo, colors, durLabel, priceLabel } from '../theme';
import type { Member, Place, VoteValue } from '../types';
import { Icon } from './Icon';
import { Avatar, Tag, headingFont } from './ui';

const THRESHOLD = 96;
const OUT = 520;

export type SwipeCardHandle = { fling: (v: VoteValue) => void };

const CardFace = ({ place, approvers }: { place: Place; approvers: Member[] }) => {
  const info = catInfo[place.cat];
  return (
    <View style={s.face}>
      <View style={[s.art, { backgroundColor: info.color }]}>
        <Icon name={place.cat} size={96} color={colors.white} stroke={1.4} />
        <View style={s.catBadge}>
          <Text style={s.catText}>{info.label.toUpperCase()}</Text>
        </View>
      </View>
      <View style={s.body}>
        <Text style={s.title} numberOfLines={2}>
          {place.name}
        </Text>
        <Text style={s.desc} numberOfLines={3}>
          {place.desc}
        </Text>
        <View style={s.tags}>
          <Tag label={`cerca de ${durLabel(place.dur)}`} />
          {place.price !== undefined ? <Tag label={priceLabel(place.price)} /> : null}
          {place.area ? <Tag label={place.area} /> : null}
        </View>
        {approvers.length > 0 && (
          <View style={s.approvers}>
            {approvers.slice(0, 3).map((m) => (
              <Avatar key={m.id} member={m} size={26} />
            ))}
            <Text style={s.approversText}>
              {approvers.length === 1 ? `${approvers[0].name} já aprovou` : `${approvers.length} pessoas já aprovaram`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

/** Cartão do topo: acompanha o dedo e decide o voto ao soltar. */
const TopCard = forwardRef<SwipeCardHandle, { place: Place; approvers: Member[]; onVote: (v: VoteValue) => void }>(
  ({ place, approvers, onVote }, ref) => {
    const pos = useRef(new Animated.ValueXY()).current;
    const busy = useRef(false);
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
          onPanResponderMove: (_, g) => pos.setValue({ x: g.dx, y: g.dy }),
          onPanResponderRelease: (_, g) => {
            // velocidade também conta: um peteleco curto vale como swipe
            if (g.dx > THRESHOLD || (g.vx > 0.8 && g.dx > 30)) fling(1);
            else if (g.dx < -THRESHOLD || (g.vx < -0.8 && g.dx < -30)) fling(-1);
            else if (g.dy < -THRESHOLD && Math.abs(g.dx) < THRESHOLD) fling(2);
            else Animated.spring(pos, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start();
          },
          onPanResponderTerminate: () =>
            Animated.spring(pos, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start(),
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
        <CardFace place={place} approvers={approvers} />
        <Animated.View style={[s.stamp, s.stampRight, { opacity: likeO, borderColor: colors.white }]}>
          <Text style={s.stampText}>BORA</Text>
        </Animated.View>
        <Animated.View style={[s.stamp, s.stampLeft, { opacity: nopeO, borderColor: colors.white }]}>
          <Text style={s.stampText}>PASSO</Text>
        </Animated.View>
        <Animated.View style={[s.stamp, s.stampCenter, { opacity: superO, borderColor: colors.white }]}>
          <Text style={s.stampText}>IMPERDÍVEL</Text>
        </Animated.View>
      </Animated.View>
    );
  },
);

export const SwipeDeck = forwardRef<
  SwipeCardHandle,
  { current: Place; next?: Place; approversOf: (p: Place) => Member[]; onVote: (p: Place, v: VoteValue) => void }
>(({ current, next, approversOf, onVote }, ref) => (
  <View style={s.deck}>
    {next && (
      <View style={[s.card, s.under]} pointerEvents="none">
        <CardFace place={next} approvers={[]} />
      </View>
    )}
    {/* key por lugar: cada cartão nasce com posição zerada */}
    <TopCard key={current.id} ref={ref} place={current} approvers={approversOf(current)} onVote={(v) => onVote(current, v)} />
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
  art: { flex: 5, minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  catBadge: { position: 'absolute', left: 16, top: 16, backgroundColor: colors.white, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  catText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, color: colors.ink },
  body: { flex: 6, padding: 20, gap: 10 },
  title: { fontFamily: headingFont, fontSize: 26, fontWeight: '700', color: colors.ink },
  desc: { fontSize: 15, lineHeight: 22, color: colors.body },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  approvers: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto' },
  approversText: { fontSize: 13, color: colors.muted, marginLeft: 2 },
  stamp: { position: 'absolute', top: 18, borderWidth: 3, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  stampRight: { left: 18, transform: [{ rotate: '-10deg' }], top: 60 },
  stampLeft: { right: 18, transform: [{ rotate: '10deg' }], top: 60 },
  stampCenter: { alignSelf: 'center', top: 100 },
  stampText: { fontFamily: headingFont, fontSize: 22, fontWeight: '700', color: colors.white },
});
