import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/src/theme";

const ROWS: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] = [
  { icon: "sparkles", label: "Render Motoru", value: "Gemini Nano Banana" },
  { icon: "scan", label: "Ölçüm Motoru", value: "Gemini Vision AI" },
  { icon: "cloud-outline", label: "Kayıt", value: "Bulut (Cihaz Bağımsız)" },
  { icon: "shield-checkmark", label: "Gizlilik", value: "Fotoğraflar sadece render için kullanılır" },
  { icon: "language", label: "Dil", value: "Türkçe" },
  { icon: "information-circle", label: "Versiyon", value: "1.0.0" },
];

export default function SettingsTab() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Ayarlar</Text>
        <Text style={styles.subtitle}>Uygulama ve hesap tercihleri</Text>
      </View>

      <View style={styles.brandCard}>
        <Text style={styles.brandLogo}>
          Perde
          <Text style={{ color: colors.brand }}>FIT</Text>
        </Text>
        <Text style={styles.brandTag}>Perdeni seç, odana mükemmel uyum.</Text>
      </View>

      <View style={styles.group}>
        {ROWS.map((r, i) => (
          <View
            key={r.label}
            style={[styles.row, i < ROWS.length - 1 && styles.rowDivider]}
            testID={`setting-row-${r.label}`}
          >
            <View style={styles.rowIcon}>
              <Ionicons name={r.icon} size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowValue}>{r.value}</Text>
            </View>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  header: { paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "800" },
  subtitle: { color: colors.muted, marginTop: 4 },
  brandCard: {
    marginTop: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  brandLogo: { color: colors.onSurface, fontSize: 30, fontWeight: "800", letterSpacing: 0.5 },
  brandTag: { color: colors.muted, marginTop: 6 },
  group: {
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: "rgba(0,212,228,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { color: colors.onSurface, fontWeight: "600", fontSize: 14 },
  rowValue: { color: colors.muted, marginTop: 2, fontSize: 12 },
});
