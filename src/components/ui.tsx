import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { colors } from '../theme';
import type { Member } from '../types';
import { Icon, type IconName } from './Icon';

export const headingFont = Platform.select({
  ios: 'Avenir Next',
  android: 'sans-serif-medium',
  default: "'Space Grotesk', 'Avenir Next', system-ui, sans-serif",
});

export const H1 = ({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) => (
  <Text accessibilityRole="header" style={[s.h1, style]}>
    {children}
  </Text>
);

export const H2 = ({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) => (
  <Text accessibilityRole="header" style={[s.h2, style]}>
    {children}
  </Text>
);

type ButtonProps = {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'outline' | 'dark' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
};

export const Button = ({ label, onPress, kind = 'primary', disabled, style, small }: ButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled: !!disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      s.btn,
      small && s.btnSmall,
      kind === 'primary' && { backgroundColor: colors.accent },
      kind === 'dark' && { backgroundColor: colors.ink },
      kind === 'outline' && { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.ink },
      kind === 'ghost' && { backgroundColor: 'transparent' },
      disabled && { opacity: 0.45 },
      pressed && { opacity: 0.8 },
      style,
    ]}
  >
    <Text
      style={[
        s.btnText,
        small && { fontSize: 14 },
        (kind === 'outline' || kind === 'ghost') && { color: colors.ink },
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

export const IconButton = ({
  icon,
  label,
  onPress,
  size = 44,
  bg = colors.surface,
  color = colors.ink,
  border = true,
  disabled,
  iconSize,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  bg?: string;
  color?: string;
  border?: boolean | string;
  disabled?: boolean;
  iconSize?: number;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    disabled={disabled}
    onPress={onPress}
    hitSlop={size < 44 ? (44 - size) / 2 : 0}
    style={({ pressed }) => [
      {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: border ? (typeof border === 'string' ? 2 : 1) : 0,
        borderColor: typeof border === 'string' ? border : colors.line,
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      },
    ]}
  >
    <Icon name={icon} size={iconSize ?? Math.round(size * 0.45)} color={color} stroke={2.2} />
  </Pressable>
);

export const Chip = ({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: !!active }}
    onPress={onPress}
    style={[s.chip, active && { backgroundColor: colors.ink, borderColor: colors.ink }]}
  >
    <Text style={[s.chipText, active && { color: colors.white, fontWeight: '700' }]}>{label}</Text>
  </Pressable>
);

export const Avatar = ({ member, size = 32, ring }: { member: Pick<Member, 'name' | 'color'>; size?: number; ring?: boolean }) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: member.color,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: ring ? 2 : 0,
      borderColor: colors.white,
    }}
  >
    <Text style={{ color: colors.white, fontWeight: '700', fontSize: size * 0.42 }}>
      {(member.name.trim()[0] ?? '?').toUpperCase()}
    </Text>
  </View>
);

export const Progress = ({ value, color = colors.accent }: { value: number; color?: string }) => (
  <View style={s.track}>
    <View style={[s.fill, { width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, backgroundColor: color }]} />
  </View>
);

export const Tag = ({ label }: { label: string }) => (
  <View style={s.tag}>
    <Text style={s.tagText}>{label}</Text>
  </View>
);

export const Card = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.card, style]}>{children}</View>
);

export const Header = ({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) => (
  <View style={s.header}>
    {onBack && <IconButton icon="back" label="Voltar" onPress={onBack} />}
    <View style={{ flex: 1 }}>
      {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
      <H1 style={{ fontSize: 26 }}>{title}</H1>
    </View>
    {right}
  </View>
);

const s = StyleSheet.create({
  h1: { fontFamily: headingFont, fontSize: 30, fontWeight: '700', color: colors.ink },
  h2: { fontFamily: headingFont, fontSize: 18, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 13, color: colors.muted, marginBottom: 2 },
  btn: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnSmall: { height: 44, borderRadius: 12, paddingHorizontal: 14 },
  btnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  chip: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 14, color: colors.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden', flex: 1 },
  fill: { height: 8, borderRadius: 4 },
  tag: { backgroundColor: colors.bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  tagText: { fontSize: 13, fontWeight: '500', color: colors.ink },
  card: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
});
