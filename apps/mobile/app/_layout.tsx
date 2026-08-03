import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LockGate } from '@/components/LockGate';
import { SessionProvider } from '@/lib/session';
import { C } from '@/lib/tokens';

/** v3 is light-only and typeset entirely in Plus Jakarta Sans. */
export default function RootLayout() {
  const [loaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <LockGate>
          <View style={{ flex: 1, backgroundColor: C.canvas }}>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: C.canvas },
                animation: 'slide_from_right',
              }}
            />
          </View>
        </LockGate>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
