// Discover: proves the stack against real data. A read-only list of the
// latest reviews from Firestore `items` (public read per firestore.rules).
// No writes anywhere in this scaffold.
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { db } from '@/lib/firebase';
import { colors } from '@/theme/colors';

type Review = { id: string; name?: string; bakeryName?: string; userName?: string; overallRating?: number };

export default function DiscoverScreen() {
  const [items, setItems] = useState<Review[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'items'), orderBy('createdAt', 'desc'), limit(20)))
      .then((snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Review, 'id'>) }))))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Screen title="Discover">
      {error ? <Text style={styles.error}>Could not load reviews: {error}</Text> : null}
      {!items && !error ? <ActivityIndicator color={colors.caramel} /> : null}
      <FlatList
        data={items ?? []}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name ?? 'Unknown bake'}</Text>
            <Text style={styles.meta}>
              {item.bakeryName ?? 'Unknown bakery'} · {item.userName ?? 'Anonymous'}
              {item.overallRating ? ` · ${item.overallRating.toFixed(1)}` : ''}
            </Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.creamWhite, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  name: { fontSize: 17, fontWeight: '600', color: colors.espresso },
  meta: { marginTop: 4, color: colors.textMuted },
  error: { color: '#9B2C2C', marginBottom: 8 },
});
