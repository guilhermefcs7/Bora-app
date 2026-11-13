import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { Icon } from './Icon';

const OPEN = 92;

/**
 * Linha que desliza para a esquerda e revela a lixeira.
 * A exclusão pede um segundo toque, porque não dá para desfazer.
 */
export const SwipeRow = ({ label, onDelete, children }: { label: string; onDelete: () => void; children: React.ReactNode }) => {
  const x = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  // na web, soltar o arrasto ainda dispara o clique do cartão: este bloqueio curto evita abrir a viagem
  const [dragging, setDragging] = useState(false);

  const settle = (toOpen: boolean) => {
    openRef.current = toOpen;
    setOpen(toOpen);
    if (!toOpen) setArmed(false);
    Animated.spring(x, { toValue: toOpen ? -OPEN : 0, friction: 9, useNativeDriver: false }).start();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        // só assume o gesto quando ele é claramente horizontal, para não brigar com a rolagem da lista
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderGrant: () => setDragging(true),
        onPanResponderMove: (_, g) => {
          const base = openRef.current ? -OPEN : 0;
          x.setValue(Math.max(-OPEN - 24, Math.min(0, base + g.dx)));
        },
        onPanResponderRelease: (_, g) => {
          const base = openRef.current ? -OPEN : 0;
          settle(base + g.dx < -OPEN / 2 || g.vx < -0.5);
          setTimeout(() => setDragging(false), 250);
        },
        onPanResponderTerminate: () => {
          settle(openRef.current);
          setTimeout(() => setDragging(false), 250);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <View>
      <View style={s.behind}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={armed ? `Confirmar exclusão de ${label}` : `Excluir ${label}`}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
          disabled={!open}
          onPress={() => (armed ? onDelete() : setArmed(true))}
          style={[s.bin, armed && { backgroundColor: '#7F1D1D' }]}
        >
          <Icon name="trash" size={22} color={colors.white} />
          <Text style={s.binText}>{armed ? 'Confirmar' : 'Excluir'}</Text>
        </Pressable>
      </View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {children}
        {(open || dragging) && (
          <Pressable accessibilityLabel="Fechar" style={s.cover} onPress={() => (dragging ? undefined : settle(false))} />
        )}
      </Animated.View>
    </View>
  );
};

const s = StyleSheet.create({
  behind: { position: 'absolute', right: 0, top: 0, bottom: 0, width: OPEN - 8, justifyContent: 'center' },
  bin: { flex: 1, borderRadius: 18, backgroundColor: '#B91C1C', alignItems: 'center', justifyContent: 'center', gap: 4 },
  binText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  cover: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
});
