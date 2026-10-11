import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, typeLabel, type Project } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getProject(id)
      .then(setProject)
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [id]);

  const onDelete = async () => {
    if (!project) return;
    try {
      setDeleting(true);
      await api.deleteProject(project.id);
      router.replace("/(tabs)/projects");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Ionicons name="alert-circle" size={48} color={colors.muted} />
        <Text style={styles.notFound}>Proje bulunamadı</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace("/(tabs)/projects")}>
          <Text style={styles.primaryText}>Projelere Dön</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="pd-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Proje Detayı</Text>
        <Pressable onPress={onDelete} style={styles.iconBtn} testID="pd-delete" disabled={deleting}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.hero}>
          <Image
            source={{ uri: `data:image/png;base64,${project.rendered_image_base64}` }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={["transparent", "rgba(9,9,11,0.9)"]}
            style={styles.heroScrim}
          />
          <View style={styles.heroFoot}>
            <Text style={styles.heroName}>{project.name}</Text>
            <Text style={styles.heroDate}>{new Date(project.created_at).toLocaleDateString("tr-TR")}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ölçü Bilgileri</Text>
          <View style={styles.row2}>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>En</Text>
              <Text style={styles.infoValue}>{Math.round(project.window_width_cm)} cm</Text>
            </View>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Boy</Text>
              <Text style={styles.infoValue}>{Math.round(project.window_height_cm)} cm</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seçilen Perde</Text>
          <View style={styles.curtainCard} testID="pd-curtain-card">
            <View style={styles.curtainThumb}>
              <Ionicons name="pricetag" size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.curtainName}>
                {project.layers?.length ? project.layers.join(" + ") : project.curtain_name}
              </Text>
              <Text style={styles.curtainSub}>
                {typeLabel(project.curtain_type)} • {project.curtain_color}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={styles.quoteBtn}
          onPress={() => router.push(`/order/${project.id}`)}
          testID="pd-quote"
        >
          <Ionicons
            name={project.quote_id ? "receipt-outline" : "cart-outline"}
            size={16}
            color={colors.onBrand}
          />
          <Text style={styles.primaryText}>
            {project.quote_id ? "Teklif Talebini Gör" : "Sipariş / Fiyat Teklifi İste"}
          </Text>
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.replace("/(tabs)/projects")}
          testID="pd-back-to-projects"
        >
          <Text style={styles.secondaryText}>Projeleri Görüntüle</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md, flex: 1 },
  notFound: { color: colors.muted },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  hero: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    overflow: "hidden",
    aspectRatio: 4 / 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  heroScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "50%" },
  heroFoot: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  heroName: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  heroDate: { color: colors.onSurfaceSecondary, marginTop: 4, fontSize: 12 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700", marginBottom: spacing.sm },
  row2: { flexDirection: "row", gap: spacing.md },
  infoBox: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  infoLabel: { color: colors.muted, fontSize: 12 },
  infoValue: { color: colors.onSurface, fontSize: 20, fontWeight: "800", marginTop: 4 },
  curtainCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  curtainThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,212,228,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  curtainName: { color: colors.onSurface, fontWeight: "700" },
  curtainSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  quoteBtn: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtn: {
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: colors.onSurface, fontWeight: "700" },
  primaryBtn: {
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.onBrand, fontWeight: "800" },
});
