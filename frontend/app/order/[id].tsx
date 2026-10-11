import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, typeLabel, type Project, type Quote } from "@/src/api";
import { colors, radius, spacing } from "@/src/theme";

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<Quote | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);
  const [installation, setInstallation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Quote | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const p = await api.getProject(id);
        setProject(p);
        if (p.quote_id) {
          const q = await api.getQuote(p.quote_id).catch(() => null);
          if (q) setExisting(q);
        }
      } catch {
        setProject(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const valid = name.trim().length >= 2 && phone.trim().length >= 7 && city.trim().length >= 2;

  const onSubmit = async () => {
    if (!project || !valid) return;
    try {
      setSubmitting(true);
      setError(null);
      const q = await api.createQuote({
        project_id: project.id,
        customer_name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        city: city.trim(),
        address: address.trim() || undefined,
        notes: note.trim() || undefined,
        quantity: qty,
        installation,
      });
      setDone(q);
    } catch {
      setError("Teklif talebi gönderilemedi, lütfen tekrar dene");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.brand} />
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Ionicons name="alert-circle" size={48} color={colors.muted} />
        <Text style={styles.muted}>Proje bulunamadı</Text>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace("/(tabs)/projects")}>
          <Text style={styles.primaryText}>Projelere Dön</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const quote = done ?? existing;
  if (quote) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <View style={styles.iconBtn} />
          <Text style={styles.title}>Teklif Talebi</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={[styles.center, { flex: 1 }]} testID="order-success">
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={40} color={colors.onBrand} />
          </View>
          <Text style={styles.successTitle}>
            {done ? "Teklif talebin alındı!" : "Bu proje için teklif istendi"}
          </Text>
          <Text style={styles.refText}>Referans No: {quote.reference}</Text>
          <Text style={styles.muted}>
            {quote.customer_name} • {quote.phone}
            {"\n"}
            {quote.layers.join(" + ")} • {Math.round(quote.window_width_cm)}×
            {Math.round(quote.window_height_cm)} cm • {quote.quantity} adet
            {quote.installation ? " • Montaj dahil" : ""}
          </Text>
          <Text style={[styles.muted, { marginTop: spacing.sm }]}>
            Ekibimiz en kısa sürede fiyat teklifi ile sana ulaşacak.
          </Text>
        </View>
        <View style={styles.footer}>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => router.replace(`/project/${project.id}`)}
            testID="order-view-project"
          >
            <Text style={styles.secondaryText}>Projeyi Gör</Text>
          </Pressable>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.replace("/(tabs)/projects")}
            testID="order-done"
          >
            <Text style={styles.primaryText}>Projelere Dön</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const layers = project.layers?.length ? project.layers : [project.curtain_name];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.replace(`/project/${project.id}`)}
          style={styles.iconBtn}
          testID="order-back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Sipariş / Fiyat Teklifi</Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.summary} testID="order-summary">
            <Image
              source={{ uri: `data:image/png;base64,${project.rendered_image_base64}` }}
              style={styles.thumb}
              contentFit="cover"
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.summaryName} numberOfLines={1}>
                {project.name}
              </Text>
              <Text style={styles.summarySub} numberOfLines={2}>
                {layers.join(" + ")}
              </Text>
              <Text style={styles.summarySub}>
                {typeLabel(project.curtain_type)} • {project.curtain_color}
              </Text>
              <View style={styles.dimRow}>
                <View style={styles.dimChip}>
                  <Text style={styles.dimChipText}>
                    Pencere {Math.round(project.window_width_cm)}×{Math.round(project.window_height_cm)} cm
                  </Text>
                </View>
                {project.wall_width_cm && project.wall_height_cm ? (
                  <View style={styles.dimChip}>
                    <Text style={styles.dimChipText}>
                      Duvar {Math.round(project.wall_width_cm)}×{Math.round(project.wall_height_cm)} cm
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <Text style={styles.section}>İletişim Bilgileri</Text>
          <Field label="Ad Soyad *" value={name} onChangeText={setName} testID="order-name" />
          <Field
            label="Telefon *"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            testID="order-phone"
            placeholder="05xx xxx xx xx"
          />
          <Field
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            testID="order-email"
          />

          <Text style={styles.section}>Teslimat</Text>
          <Field label="Şehir *" value={city} onChangeText={setCity} testID="order-city" />
          <Field
            label="Adres"
            value={address}
            onChangeText={setAddress}
            multiline
            testID="order-address"
          />

          <Text style={styles.section}>Sipariş Detayı</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.rowLabel}>Pencere adedi</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setQty((q) => Math.max(1, q - 1))}
                style={styles.stepBtn}
                testID="order-qty-minus"
              >
                <Ionicons name="remove" size={18} color={colors.onSurface} />
              </Pressable>
              <Text style={styles.stepVal} testID="order-qty">
                {qty}
              </Text>
              <Pressable
                onPress={() => setQty((q) => Math.min(50, q + 1))}
                style={styles.stepBtn}
                testID="order-qty-plus"
              >
                <Ionicons name="add" size={18} color={colors.onSurface} />
              </Pressable>
            </View>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.rowLabel}>Montaj hizmeti istiyorum</Text>
            <Switch
              value={installation}
              onValueChange={setInstallation}
              trackColor={{ true: colors.brandDim, false: colors.border }}
              thumbColor={installation ? colors.brand : colors.muted}
              testID="order-installation"
            />
          </View>
          <Field
            label="Not"
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Kumaş tercihi, teslim tarihi vb."
            testID="order-note"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.primaryBtn, { flex: 1 }, (!valid || submitting) && { opacity: 0.5 }]}
            disabled={!valid || submitting}
            onPress={onSubmit}
            testID="order-submit"
          >
            {submitting ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={16} color={colors.onBrand} />
                <Text style={styles.primaryText}>Fiyat Teklifi İste</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  testID?: string;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "phone-pad" | "email-address";
  autoCapitalize?: "none" | "sentences";
}) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize}
        multiline={props.multiline}
        style={[fieldStyles.input, props.multiline && fieldStyles.multiline]}
        testID={props.testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  muted: { color: colors.muted, textAlign: "center", lineHeight: 20 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  summary: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: { width: 84, height: 105, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  summaryName: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  summarySub: { color: colors.onSurfaceSecondary, fontSize: 12 },
  dimRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  dimChip: {
    backgroundColor: colors.brandTint,
    borderColor: colors.brandDim,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  dimChipText: { color: colors.brand, fontSize: 11, fontWeight: "700" },
  section: {
    color: colors.onSurface,
    fontSize: 15,
    fontWeight: "700",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  rowLabel: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  stepBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  stepVal: { color: colors.onSurface, fontWeight: "800", minWidth: 24, textAlign: "center" },
  errorText: { color: colors.error, marginTop: spacing.md, textAlign: "center" },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  primaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryText: { color: colors.onBrand, fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: colors.onSurface, fontWeight: "700" },
  successIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  successTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800", textAlign: "center" },
  refText: { color: colors.brand, fontWeight: "800", fontSize: 15, marginBottom: spacing.sm },
});

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { color: colors.muted, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 50,
    color: colors.onSurface,
    fontSize: 15,
  },
  multiline: { height: 88, paddingTop: spacing.sm, textAlignVertical: "top" },
});
