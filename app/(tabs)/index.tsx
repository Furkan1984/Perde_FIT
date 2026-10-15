import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/src/theme";
import { flow } from "@/src/state";

const SAMPLES = [
  {
    id: "s1",
    title: "Modern Salon",
    subtitle: "Fon Perde • Keten",
    image:
      "https://images.unsplash.com/photo-1754611380518-61a923cc47ca?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzOTB8MHwxfHNlYXJjaHwyfHxsdXh1cnklMjBsaXZpbmclMjByb29tJTIwd2luZG93JTIwY3VydGFpbnN8ZW58MHx8fHwxNzg2NTQ5MDc3fDA&ixlib=rb-4.1.0&q=85",
  },
  {
    id: "s2",
    title: "Minimal Yatak Odası",
    subtitle: "Tül • İnci Beyaz",
    image:
      "https://images.unsplash.com/photo-1754611362309-71297e9f42fd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzOTB8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBsaXZpbmclMjByb29tJTIwd2luZG93JTIwY3VydGFpbnN8ZW58MHx8fHwxNzg2NTQ5MDc3fDA&ixlib=rb-4.1.0&q=85",
  },
  {
    id: "s3",
    title: "Loft Çalışma",
    subtitle: "Stor • Antrasit",
    image:
      "https://images.unsplash.com/photo-1724582586458-a51791349977?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MTJ8MHwxfHNlYXJjaHwyfHxkYXJrJTIwbW9kZXJuJTIwbGl2aW5nJTIwcm9vbSUyMGludGVyaW9yfGVufDB8fHx8MTc4NjU0OTA3N3ww&ixlib=rb-4.1.0&q=85",
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const [pickingGallery, setPickingGallery] = useState(false);

  const onPickFromGallery = async () => {
    try {
      setPickingGallery(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 0.7,
        allowsEditing: false,
      });
      if (res.canceled || !res.assets?.[0]?.base64) return;
      flow.reset();
      flow.set({ original_image_base64: res.assets[0].base64 });
      router.push("/measure");
    } finally {
      setPickingGallery(false);
    }
  };

  const onOpenCamera = () => {
    // expo-camera is not usable in a browser; fall back to the gallery on web.
    if (Platform.OS === "web") {
      onPickFromGallery();
      return;
    }
    flow.reset();
    router.push("/camera");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        testID="home-scroll"
      >
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="menu" size={26} color={colors.onSurface} testID="home-menu-icon" />
          <View style={styles.logoWrap}>
            <Text style={styles.logoText}>
              Perde
              <Text style={{ color: colors.brand }}>FIT</Text>
            </Text>
          </View>
          <Ionicons name="notifications-outline" size={22} color={colors.muted} />
        </View>

        {/* Hero title */}
        <View style={styles.heroBlock}>
          <Text style={styles.heroTitle}>Perdeni seç,</Text>
          <Text style={styles.heroTitle2}>odana mükemmel uyum.</Text>
          <Text style={styles.heroSub}>
            Fotoğraf çek, yapay zeka pencereni ölçsün; perdeni renderla ve odana bakan gerçek
            görüntüyü an içinde gör.
          </Text>
        </View>

        {/* Primary CTA cards */}
        <Pressable
          testID="home-capture-btn"
          onPress={onOpenCamera}
          style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={[colors.brandTint, colors.surfaceSecondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.actionIcon}>
            <Ionicons name="camera" size={26} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Fotoğraf Çek</Text>
            <Text style={styles.actionSub}>Odanı fotoğrafla, otomatik ölçüm yap</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>

        <Pressable
          testID="home-upload-btn"
          onPress={onPickFromGallery}
          disabled={pickingGallery}
          style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={[colors.surfaceSecondary, colors.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.actionIcon}>
            {pickingGallery ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Ionicons name="image" size={26} color={colors.brand} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Fotoğraf Yükle</Text>
            <Text style={styles.actionSub}>Galerinden fotoğraf seçerek devam et</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.onSurfaceSecondary} />
        </Pressable>

        {/* Sample projects */}
        <Text style={styles.sectionTitle}>Örnek Projeler</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          style={{ marginHorizontal: -spacing.lg }}
        >
          {SAMPLES.map((s) => (
            <View key={s.id} style={styles.sampleCard} testID={`sample-${s.id}`}>
              <Image source={{ uri: s.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient
                colors={["transparent", "rgba(9,9,11,0.9)"]}
                style={styles.sampleScrim}
              />
              <View style={styles.sampleFoot}>
                <Text style={styles.sampleTitle}>{s.title}</Text>
                <Text style={styles.sampleSub}>{s.subtitle}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  logoWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoText: { color: colors.onSurface, fontSize: 22, fontWeight: "800", letterSpacing: 0.5 },
  heroBlock: { paddingVertical: spacing.lg, gap: 4 },
  heroTitle: { color: colors.onSurface, fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  heroTitle2: { color: colors.onSurface, fontSize: 26, fontWeight: "700", letterSpacing: -0.3 },
  heroSub: { color: colors.muted, marginTop: spacing.sm, fontSize: 14, lineHeight: 20 },
  actionCard: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 92,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: "rgba(0,212,228,0.10)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,212,228,0.35)",
  },
  actionTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  actionSub: { color: colors.muted, marginTop: 2, fontSize: 13 },
  sectionTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: "700",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sampleCard: {
    width: 180,
    height: 220,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sampleScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "60%" },
  sampleFoot: { position: "absolute", left: spacing.md, right: spacing.md, bottom: spacing.md },
  sampleTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  sampleSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
});
