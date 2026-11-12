import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavProvider, useNav } from './src/nav';
import { HomeScreen, Welcome } from './src/screens/HomeScreen';
import { JoinScreen } from './src/screens/JoinScreen';
import { NewTripScreen } from './src/screens/NewTripScreen';
import { TripScreen } from './src/screens/trip/TripScreen';
import { StoreProvider, useStore } from './src/store';
import { colors } from './src/theme';

const Screens = () => {
  const { route } = useNav();
  const { ready, profile } = useStore();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center' }}
    >
      {/* largura máxima para a versão web em telas grandes */}
      <View style={{ flex: 1, width: '100%', maxWidth: 480, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        {!ready ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !profile.name ? (
          <Welcome invited={route.name === 'join'} />
        ) : route.name === 'home' ? (
          <HomeScreen />
        ) : route.name === 'new' ? (
          <NewTripScreen />
        ) : route.name === 'join' ? (
          <JoinScreen initialCode={route.code} />
        ) : (
          <TripScreen key={route.id} id={route.id} initialTab={route.tab} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <NavProvider>
          <Screens />
          <StatusBar style="dark" />
        </NavProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
