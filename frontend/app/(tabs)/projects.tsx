import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, type Project } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

export default function ProjectsTab() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);
      api
        .listProjects()
        .then((p) => mounted && setProjects(p))
        .catch(() => mounted && setProjects([]))
        .finally(() => mounted && setLoading(false));
      return () => {
        mounted = false;
      };
    }, []),
  );

  const empty = !loading && projects.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Projelerim</Text>
        <Text style={styles.subtitle}>Kaydettiğin tüm perde tasarımları</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : empty ? (
        <View style={styles.center}>
          <Ionicons name="folder-open-outline" size={64} color={colors.muted} />
          <Text style={styles.emptyTitle}>Henüz proje yok</Text>
          <Text style={styles.emptySub}>Ana sayfadan bir fotoğraf çekerek ilk projeni oluştur</Text>
          <Pressable
            style={styles.emptyCta}
            onPress={() => router.push("/")}
            testID="empty-create-btn"
          >
            <Text style={styles.emptyCtaText}>Ana Sayfaya Git</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/project/${item.id}`)}
              testID={`project-card-${item.id}`}
            >
              <Image
                source={{ uri: `data:image/png;base64,${item.rendered_image_base64}` }}
                style={styles.thumb}
                contentFit="cover"
              />
              <View style={{ flex: 1, padding: spacing.md }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.cardMeta}>
                  {item.curtain_name} • {item.curtain_type}
                </Text>
                <Text style={styles.cardDim}>
                  {Math.round(item.window_width_cm)} × {Math.round(item.window_height_cm)} cm
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.muted} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "800" },
  subtitle: { color: colors.muted, marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "700", marginTop: spacing.md },
  emptySub: { color: colors.muted, textAlign: "center", marginTop: 6 },
  emptyCta: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  emptyCtaText: { color: colors.onBrand, fontWeight: "700" },
  list: { padding: spacing.lg, paddingBottom: 140, gap: spacing.md },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.md,
    paddingRight: spacing.md,
  },
  thumb: { width: 96, height: 96 },
  cardTitle: { color: colors.onSurface, fontWeight: "700", fontSize: 15 },
  cardMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  cardDim: { color: colors.brand, fontSize: 12, marginTop: 6, fontWeight: "600" },
});
