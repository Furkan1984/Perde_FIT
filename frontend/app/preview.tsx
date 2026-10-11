import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, typeLabel } from "@/src/api";
import { flow } from "@/src/state";
import { colors, radius, spacing } from "@/src/theme";

export default function PreviewScreen() {
  const router = useRouter();
  const state = flow.get();
  const [rendering, setRendering] = useState(true);
  const [renderedB64, setRenderedB64] = useState<string | null>(state.rendered_image_base64);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveDialog, setSaveDialog] = useState(false);
  const [projectName, setProjectName] = useState("");
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    const c = state.curtain;
    const img = state.original_image_base64;
    const m = state.measurement;
    if (!c || !img || !m) {
      router.replace("/");
      return;
    }
    // Prevent duplicate renders on re-mount
    const key = `${c.id}|${img.slice(0, 24)}`;
    if (startedFor.current === key) return;
    startedFor.current = key;

    let cancelled = false;
    (async () => {
      try {
        setRendering(true);
        setError(null);
        const res = await api.render({
          image_base64: img,
          curtain_type: c.type,
          curtain_name: c.name,
          curtain_color: c.color,
          window_width_cm: m.window_width_cm,
          window_height_cm: m.window_height_cm,
          layer_over_existing: state.layer_count > 0,
          ...(m.window_bbox_pct ? { window_bbox_pct: m.window_bbox_pct } : {}),
          ...(state.custom_texture_base64
            ? { texture_image_base64: state.custom_texture_base64 }
            : {}),
        });
        if (cancelled) return;
        setRenderedB64(res.rendered_image_base64);
        flow.set({
          rendered_image_base64: res.rendered_image_base64,
          layers: [
            ...state.layers,
            { curtain: c, custom_texture_base64: state.custom_texture_base64 ?? null },
          ],
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Render sırasında hata oluştu");
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChangeCurtain = () => router.back();

  const onAddLayer = () => {
    if (!renderedB64) return;
    // Use the current rendered image as the base for the next layer.
    flow.set({
      original_image_base64: renderedB64,
      rendered_image_base64: null,
      curtain: null,
      custom_texture_base64: null,
      layer_count: state.layer_count + 1,
    });
    router.replace("/curtain-select");
  };

  const onOpenSave = () => {
    setProjectName(state.curtain?.name ? `${state.curtain.name} Projesi` : "Yeni Proje");
    setSaveDialog(true);
  };

  const onSave = async () => {
    if (!renderedB64 || !state.curtain || !state.measurement || !state.original_image_base64) return;
    try {
      setSaving(true);
      const layerNames = [...state.layers.map((l) => l.curtain.name)];
      if (!layerNames.includes(state.curtain.name)) layerNames.push(state.curtain.name);
      const p = await api.createProject({
        name: projectName || "Yeni Proje",
        original_image_base64: state.original_image_base64,
        rendered_image_base64: renderedB64,
        curtain_id: state.curtain.id,
        curtain_name: state.curtain.name,
        curtain_type: state.curtain.type,
        curtain_color: state.curtain.color,
        window_width_cm: state.measurement.window_width_cm,
        window_height_cm: state.measurement.window_height_cm,
        wall_width_cm: state.measurement.wall_width_cm,
        wall_height_cm: state.measurement.wall_height_cm,
        layers: layerNames,
      });
      setSaveDialog(false);
      flow.reset();
      router.replace(`/order/${p.id}`);
    } catch (e) {
      setError("Proje kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const heroUri = renderedB64
    ? `data:image/png;base64,${renderedB64}`
    : state.original_image_base64
      ? `data:image/jpeg;base64,${state.original_image_base64}`
      : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="prev-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Perde Önizleme</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.heroWrap}>
        {heroUri ? (
          <Image source={{ uri: heroUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={StyleSheet.absoluteFill} />
        )}
        {rendering ? (
          <View style={styles.overlay}>
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={styles.overlayTitle}>
              {state.layer_count > 0 ? "Mevcut perdenin üstüne yerleştiriliyor..." : "AI perdeyi yerleştiriyor..."}
            </Text>
            <Text style={styles.overlaySub}>Bu birkaç saniye sürebilir</Text>
          </View>
        ) : error ? (
          <View style={styles.overlay}>
            <Ionicons name="alert-circle" size={40} color={colors.error} />
            <Text style={styles.overlayTitle}>Render başarısız</Text>
            <Text style={styles.overlaySub}>{error}</Text>
          </View>
        ) : state.layer_count > 0 ? (
          <View style={styles.layerBadge} testID="prev-layer-badge">
            <Ionicons name="layers" size={12} color={colors.brand} />
            <Text style={styles.layerBadgeText}>{state.layers.length} Katman</Text>
          </View>
        ) : null}
      </View>

      {state.curtain ? (
        <View style={styles.metaCard}>
          <View style={styles.metaThumb}>
            {state.curtain.thumbnail_url ? (
              <Image
                source={{ uri: state.curtain.thumbnail_url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : state.custom_texture_base64 ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${state.custom_texture_base64}` }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="pricetag" size={18} color={colors.brand} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.metaName}>{state.curtain.name}</Text>
            <Text style={styles.metaSub}>
              {typeLabel(state.curtain.type)} • {state.curtain.color}
            </Text>
          </View>
          {state.measurement ? (
            <View style={styles.dimBox}>
              <Text style={styles.dimTxt}>
                {Math.round(state.measurement.window_width_cm)}×
                {Math.round(state.measurement.window_height_cm)} cm
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable style={styles.secondaryBtn} onPress={onChangeCurtain} testID="prev-change">
          <Ionicons name="swap-horizontal" size={16} color={colors.onSurface} />
          <Text style={styles.secondaryText}>Değiştir</Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryBtn, (rendering || !!error) && { opacity: 0.5 }]}
          onPress={onAddLayer}
          disabled={rendering || !!error}
          testID="prev-add-layer"
        >
          <Ionicons name="add-circle-outline" size={16} color={colors.brand} />
          <Text style={[styles.secondaryText, { color: colors.brand }]}>
            {state.curtain?.type === "Tul Perde" || state.curtain?.type === "Tül Perde"
              ? "Blackout / Güneşlik Ekle"
              : state.curtain?.type === "Ahsap Jaluzi"
                ? "Rustik / Broçallı Ekle"
                : "Perde Ekle"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.primaryBtn, (rendering || !!error) && { opacity: 0.5 }]}
          disabled={rendering || !!error}
          onPress={onOpenSave}
          testID="prev-save"
        >
          <Ionicons name="save-outline" size={16} color={colors.onBrand} />
          <Text style={styles.primaryText}>Kaydet</Text>
        </Pressable>
      </View>

      {saveDialog ? (
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Projeyi Kaydet</Text>
            <Text style={styles.modalSub}>Projene bir isim ver</Text>
            <TextInput
              value={projectName}
              onChangeText={setProjectName}
              placeholder="Örn. Salon Projesi"
              placeholderTextColor={colors.muted}
              style={styles.modalInput}
              testID="save-name-input"
            />
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
              <Pressable
                style={[styles.secondaryBtn, { flex: 1 }]}
                onPress={() => setSaveDialog(false)}
                disabled={saving}
                testID="save-cancel"
              >
                <Text style={styles.secondaryText}>Vazgeç</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, { flex: 1 }]}
                onPress={onSave}
                disabled={saving}
                testID="save-confirm"
              >
                {saving ? (
                  <ActivityIndicator color={colors.onBrand} />
                ) : (
                  <Text style={styles.primaryText}>Kaydet</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  heroWrap: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: "hidden",
    aspectRatio: 4 / 5,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(9,9,11,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  overlayTitle: { color: colors.onSurface, fontWeight: "700", fontSize: 16, textAlign: "center" },
  overlaySub: { color: colors.muted, fontSize: 12, textAlign: "center" },
  layerBadge: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(9,9,11,0.75)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  layerBadgeText: { color: colors.brand, fontSize: 11, fontWeight: "800" },
  metaCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  metaName: { color: colors.onSurface, fontWeight: "700" },
  metaSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  dimBox: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.brandTint,
    borderWidth: 1,
    borderColor: colors.brandDim,
  },
  dimTxt: { color: colors.brand, fontWeight: "700", fontSize: 11 },
  footer: {
    marginTop: "auto",
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  secondaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryText: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
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
  primaryText: { color: colors.onBrand, fontWeight: "800", fontSize: 13 },
  modalWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  modalTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 18 },
  modalSub: { color: colors.muted, marginTop: 4, fontSize: 12 },
  modalInput: {
    marginTop: spacing.md,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    fontSize: 15,
  },
});
