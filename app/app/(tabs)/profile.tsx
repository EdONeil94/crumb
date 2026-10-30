// Email + password sign-in only (Google / Sign in with Apple come later).
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { auth } from '@/lib/firebase';
import { colors } from '@/theme/colors';

export default function ProfileScreen() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (loading) return <Screen title="Profile" />;

  if (user) {
    return (
      <Screen title="Profile">
        <Text style={styles.body}>Signed in as {user.email}</Text>
        <Pressable style={styles.button} onPress={() => signOut(auth)}>
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </Screen>
    );
  }

  const run = async (fn: typeof signInWithEmailAndPassword) => {
    setError(null);
    try {
      await fn(auth, email.trim(), password);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen title="Profile">
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={() => run(signInWithEmailAndPassword)}>
        <Text style={styles.buttonText}>Sign in</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.secondary]} onPress={() => run(createUserWithEmailAndPassword)}>
        <Text style={[styles.buttonText, { color: colors.espresso }]}>Create account</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.textBody, fontSize: 16, marginBottom: 16 },
  input: { backgroundColor: colors.creamWhite, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 10, fontSize: 16 },
  button: { backgroundColor: colors.caramel, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 6 },
  secondary: { backgroundColor: colors.honeyLight },
  buttonText: { color: colors.creamWhite, fontWeight: '600', fontSize: 16 },
  error: { color: '#9B2C2C', marginBottom: 8 },
});
