import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, CURTAIN_FILTERS as FILTERS, typeLabel, type Curtain } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

export default function CurtainsTab() {
  const router = useRouter();
  const [curtains, setCurtains] = useState<Curtain[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("Tümü");

  useEffect(() => {
    api
      .listCurtains()
      .then(setCurtains)
      .catch(() => setCurtains([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (filter === "Tümü" ? curtains : curtains.filter((c) => c.type === filter)),
    [filter, curtains],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Perde Kataloğu</Text>
        <Text style={styles.subtitle}>Tümünü keşfet, favori dokunu seç</Text>
      </View>

      {/* Filter chips - single horizontal row */}
      <View style={styles.chipRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f;
            const label = typeLabel(f);
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`filter-chip-${f}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable style={styles.tile} testID={`curtain-tile-${item.id}`}>
              <Image source={{ uri: item.thumbnail_url }} style={styles.tileImg} contentFit="cover" />
              <View style={styles.tileFoot}>
                <Text style={styles.tileName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.tileMeta} numberOfLines={1}>
                  {typeLabel(item.type)} • {item.color}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "800" },
  subtitle: { color: colors.muted, marginTop: 4 },
  chipRowWrap: { height: 56, justifyContent: "center" },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  chip: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.onBrand, fontWeight: "700" },
  grid: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 140,
    gap: spacing.md,
  },
  tile: {
    flex: 1,
    maxWidth: "48.5%",
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  tileImg: { width: "100%", aspectRatio: 1 },
  tileFoot: { padding: spacing.md },
  tileName: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  tileMeta: { color: colors.muted, marginTop: 2, fontSize: 12 },
});
