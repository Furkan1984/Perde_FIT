import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, type BBox } from "@/src/api";
import { DraggableFrame } from "@/src/components/DraggableFrame";
import { flow } from "@/src/state";
import { colors, radius, spacing } from "@/src/theme";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Scale a normalised box around its centre; NaN/∞ ratios fall back to 1. */
function scaleBox(b: BBox, rx: number, ry: number): BBox {
  const sx = Number.isFinite(rx) && rx > 0 ? rx : 1;
  const sy = Number.isFinite(ry) && ry > 0 ? ry : 1;
  const cx = (b.x1 + b.x2) / 2;
  const cy = (b.y1 + b.y2) / 2;
  const hw = ((b.x2 - b.x1) / 2) * sx;
  const hh = ((b.y2 - b.y1) / 2) * sy;
  return { x1: clamp01(cx - hw), x2: clamp01(cx + hw), y1: clamp01(cy - hh), y2: clamp01(cy + hh) };
}

const DEFAULT_WALL: BBox = { x1: 0.03, y1: 0.08, x2: 0.97, y2: 0.92 };

/** Window frame derived from the wall frame via cm ratios; sill ~100cm above floor. */
function deriveWindow(wall: BBox, winW: number, winH: number, wallW: number, wallH: number): BBox {
  const ww = wall.x2 - wall.x1;
  const wh = wall.y2 - wall.y1;
  const fw = Math.min(1, winW / Math.max(winW, wallW)) * ww;
  const fh = Math.min(1, winH / Math.max(winH, wallH)) * wh;
  const sill = Math.min(wh - fh, (100 / Math.max(1, wallH)) * wh);
  const cx = (wall.x1 + wall.x2) / 2;
  return { x1: cx - fw / 2, x2: cx + fw / 2, y2: wall.y2 - sill, y1: wall.y2 - sill - fh };
}

const DEFAULT_WALL_DERIVED_WIN = deriveWindow(DEFAULT_WALL, 140, 160, 340, 260);

export default function MeasureScreen() {
  const router = useRouter();
  const state = flow.get();
  const [analyzing, setAnalyzing] = useState(true);
  const [winW, setWinW] = useState<string>("140");
  const [winH, setWinH] = useState<string>("160");
  const [wallW, setWallW] = useState<string>("340");
  const [wallH, setWallH] = useState<string>("260");
  const [detected, setDetected] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [manualMode, setManualMode] = useState(false);
  const [winBbox, setWinBbox] = useState<BBox>(DEFAULT_WALL_DERIVED_WIN);
  const [wallBbox, setWallBbox] = useState<BBox>(DEFAULT_WALL);
  const [imgAspect, setImgAspect] = useState(4 / 5);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    const run = async () => {
      if (!state.original_image_base64) {
        router.replace("/");
        return;
      }
      try {
        const m = await api.analyze(state.original_image_base64);
        if (cancelledRef.current) return;
        setWinW(String(Math.round(m.window_width_cm)));
        setWinH(String(Math.round(m.window_height_cm)));
        setWallW(String(Math.round(m.wall_width_cm)));
        setWallH(String(Math.round(m.wall_height_cm)));
        setDetected(m.detected);
        setNotes(m.notes || "");
        const wall = m.wall_bbox_pct ?? DEFAULT_WALL;
        setWallBbox(wall);
        setWinBbox(
          m.window_bbox_pct ??
            deriveWindow(wall, m.window_width_cm, m.window_height_cm, m.wall_width_cm, m.wall_height_cm),
        );
        flow.set({ measurement: m });
      } catch {
        if (!cancelledRef.current)
          setNotes("Otomatik analiz yapılamadı, lütfen ölçüleri elle gir");
      } finally {
        if (!cancelledRef.current) setAnalyzing(false);
      }
    };
    run();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Editing a cm value scales the matching frame around its centre by the
  // relative change, so the preview tracks the numbers.
  const onEditField =
    (setter: (v: string) => void, prev: string, axis: "winW" | "winH" | "wallW" | "wallH") =>
    (v: string) => {
      setter(v);
      const oldN = Number(prev);
      const newN = Number(v);
      if (oldN > 0 && newN > 0) {
        const r = newN / oldN;
        if (axis === "winW") setWinBbox((b) => scaleBox(b, r, 1));
        if (axis === "winH") setWinBbox((b) => scaleBox(b, 1, r));
        if (axis === "wallW") setWallBbox((b) => scaleBox(b, r, 1));
        if (axis === "wallH") setWallBbox((b) => scaleBox(b, 1, r));
      }
      if (!manualMode) {
        setManualMode(true);
        setNotes("Elle giriş modu — önizleme güncelleniyor");
      }
    };

  // Resizing the window frame re-derives the window cm from the wall reference
  // (a pure move keeps the numbers).
  const onWindowFrameChange = (b: BBox) => {
    const resized =
      Math.abs(b.x2 - b.x1 - (winBbox.x2 - winBbox.x1)) > 1e-4 ||
      Math.abs(b.y2 - b.y1 - (winBbox.y2 - winBbox.y1)) > 1e-4;
    setWinBbox(b);
    const ww = wallBbox.x2 - wallBbox.x1;
    const wh = wallBbox.y2 - wallBbox.y1;
    const wallWN = Number(wallW);
    const wallHN = Number(wallH);
    if (resized && ww > 0 && wh > 0 && wallWN > 0 && wallHN > 0) {
      setWinW(String(Math.max(1, Math.round((wallWN * (b.x2 - b.x1)) / ww))));
      setWinH(String(Math.max(1, Math.round((wallHN * (b.y2 - b.y1)) / wh))));
    }
    if (!manualMode) setManualMode(true);
  };

  const onSkipToManual = () => {
    cancelledRef.current = true;
    setAnalyzing(false);
    setManualMode(true);
    setDetected(false);
    setNotes("Elle giriş modu — çerçeveleri sürükle, ölçüleri düzenle");
  };

  const onContinue = () => {
    const parsed = {
      detected,
      window_width_cm: Number(winW) || 140,
      window_height_cm: Number(winH) || 160,
      wall_width_cm: Number(wallW) || 340,
      wall_height_cm: Number(wallH) || 260,
      window_bbox_pct: winBbox,
      wall_bbox_pct: wallBbox,
      notes,
    };
    flow.set({ measurement: parsed });
    router.push("/curtain-select");
  };

  const onRetake = () => router.replace("/camera");

  const winWNum = Math.max(1, Number(winW) || 140);
  const winHNum = Math.max(1, Number(winH) || 160);
  const wallWNum = Math.max(1, Number(wallW) || 340);
  const wallHNum = Math.max(1, Number(wallH) || 260);
  const wallFrame = wallBbox;
  const winFrame = winBbox;

  const imageUri = state.original_image_base64
    ? `data:image/jpeg;base64,${state.original_image_base64}`
    : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="measure-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Otomatik Ölçüm</Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!dragging}
        >
          <View style={styles.banner}>
            <Ionicons
              name={manualMode ? "create-outline" : "information-circle"}
              size={16}
              color={colors.brand}
            />
            <Text style={styles.bannerText}>
              {analyzing
                ? "Duvar analiz ediliyor..."
                : manualMode
                  ? "Elle giriş modu — çerçeveleri sürükle, ölçüleri düzenle"
                  : detected
                    ? "Duvar analiz edildi. Ölçüler otomatik hesaplandı."
                    : notes || "Ölçüler tahmin edildi, gerekirse düzenle."}
            </Text>
            {analyzing ? (
              <Pressable onPress={onSkipToManual} testID="measure-skip-ai">
                <Text style={styles.skipBtn}>Elle Gir</Text>
              </Pressable>
            ) : null}
          </View>

          <View
            style={[styles.previewBox, { aspectRatio: imgAspect }]}
            onLayout={(e) =>
              setBoxSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
            }
          >
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.previewImg}
                contentFit="fill"
                onLoad={(e) => {
                  const { width, height } = e.source;
                  if (width > 0 && height > 0) setImgAspect(width / height);
                }}
              />
            ) : (
              <View style={[styles.previewImg, { backgroundColor: colors.surfaceSecondary }]} />
            )}
            {analyzing ? (
              <View style={styles.previewOverlay}>
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.overlayText}>Ölçüler tespit ediliyor...</Text>
              </View>
            ) : (
              <>
                {/* Labels (non-interactive) */}
                <View
                  pointerEvents="none"
                  style={[
                    styles.edgeRow,
                    { top: `${wallFrame.y1 * 100}%`, left: `${wallFrame.x1 * 100}%`, right: `${(1 - wallFrame.x2) * 100}%` },
                  ]}
                >
                  <View style={styles.dimPill}>
                    <Text style={styles.dimText}>Duvar {Math.round(wallWNum)} cm</Text>
                  </View>
                </View>
                <View
                  pointerEvents="none"
                  style={[
                    styles.edgeCol,
                    { top: `${wallFrame.y1 * 100}%`, bottom: `${(1 - wallFrame.y2) * 100}%`, right: `${(1 - wallFrame.x2) * 100}%` },
                  ]}
                >
                  <View style={styles.dimPill}>
                    <Text style={styles.dimText}>{Math.round(wallHNum)} cm</Text>
                  </View>
                </View>
                <View
                  pointerEvents="none"
                  style={[
                    styles.winDimPill,
                    { top: `${Math.max(0, winFrame.y1 * 100 - 6)}%`, left: `${winFrame.x1 * 100 + 1}%` },
                  ]}
                >
                  <Text style={styles.winDimText}>
                    Pencere {Math.round(winWNum)} × {Math.round(winHNum)} cm
                  </Text>
                </View>

                {/* Wall frame: ceiling-to-floor visible wall (drag to move, corners to resize) */}
                <DraggableFrame
                  box={wallFrame}
                  width={boxSize.w}
                  height={boxSize.h}
                  color={colors.warning}
                  dashed
                  onChange={setWallBbox}
                  onDragging={setDragging}
                  testID="frame-wall"
                />
                {/* Window frame: glass + joinery */}
                <DraggableFrame
                  box={winFrame}
                  width={boxSize.w}
                  height={boxSize.h}
                  color={colors.brand}
                  onChange={onWindowFrameChange}
                  onDragging={setDragging}
                  testID="frame-window"
                />
              </>
            )}
          </View>
          {!analyzing ? (
            <Text style={styles.dragHint}>
              <Ionicons name="move" size={12} color={colors.muted} /> Çerçeveyi sürükleyerek taşı;
              kenar çubukları ve köşelerden büyüt/küçült — mavi: pencere/doğrama, turuncu: duvar
            </Text>
          ) : null}

          <Text style={styles.section}>Duvar Ölçüleri</Text>
          <View style={styles.row2}>
            <Field
              label="Duvar Genişliği"
              value={wallW}
              onChangeText={onEditField(setWallW, wallW, "wallW")}
              testID="input-wall-w"
              suffix="cm"
            />
            <Field
              label="Duvar Yüksekliği"
              value={wallH}
              onChangeText={onEditField(setWallH, wallH, "wallH")}
              testID="input-wall-h"
              suffix="cm"
            />
          </View>

          <Text style={styles.section}>Pencere Ölçüleri</Text>
          <View style={styles.row2}>
            <Field
              label="Pencere Eni"
              value={winW}
              onChangeText={onEditField(setWinW, winW, "winW")}
              testID="input-win-w"
              suffix="cm"
            />
            <Field
              label="Pencere Boyu"
              value={winH}
              onChangeText={onEditField(setWinH, winH, "winH")}
              testID="input-win-h"
              suffix="cm"
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.secondaryBtn} onPress={onRetake} testID="measure-retake">
            <Ionicons name="refresh" size={14} color={colors.onSurface} />
            <Text style={styles.secondaryText}>Yeniden Ölç</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, manualMode && styles.secondaryBtnActive]}
            onPress={onSkipToManual}
            testID="measure-manual"
          >
            <Ionicons name="create-outline" size={14} color={manualMode ? colors.brand : colors.onSurface} />
            <Text style={[styles.secondaryText, manualMode && { color: colors.brand }]}>
              Elle Gir
            </Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, analyzing && { opacity: 0.5 }]}
            onPress={onContinue}
            disabled={analyzing}
            testID="measure-continue"
          >
            <Text style={styles.primaryText}>Devam Et</Text>
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
  suffix?: string;
}) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{props.label}</Text>
      <View style={fieldStyles.inputRow}>
        <TextInput
          value={props.value}
          onChangeText={props.onChangeText}
          keyboardType="numeric"
          style={fieldStyles.input}
          testID={props.testID}
          placeholderTextColor={colors.muted}
        />
        {props.suffix ? <Text style={fieldStyles.suffix}>{props.suffix}</Text> : null}
      </View>
    </View>
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
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandTint,
    borderColor: colors.brandDim,
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  bannerText: { color: colors.onSurface, flex: 1, fontSize: 13 },
  skipBtn: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  previewBox: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  previewImg: { width: "100%", height: "100%" },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  overlayText: { color: colors.onSurface, fontWeight: "600" },
  dragHint: { color: colors.muted, fontSize: 12, marginTop: spacing.sm, lineHeight: 18 },
  edgeRow: { position: "absolute", alignItems: "center", paddingTop: 4 },
  edgeCol: { position: "absolute", justifyContent: "center", alignItems: "flex-end", paddingRight: 4 },
  winDimPill: {
    position: "absolute",
    backgroundColor: "rgba(9,9,11,0.85)",
    borderWidth: 1,
    borderColor: colors.brand,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  winDimText: { color: colors.brand, fontSize: 10, fontWeight: "800" },
  dimPill: {
    backgroundColor: "rgba(9,9,11,0.85)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  dimText: { color: colors.warning, fontWeight: "700", fontSize: 11 },
  section: { color: colors.onSurface, fontSize: 15, fontWeight: "700", marginTop: spacing.lg, marginBottom: spacing.sm },
  row2: { flexDirection: "row", gap: spacing.md },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    flexDirection: "row",
    gap: 6,
  },
  secondaryBtnActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandTint,
  },
  secondaryText: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  primaryBtn: {
    flex: 1.2,
    height: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  primaryText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
});

const fieldStyles = StyleSheet.create({
  wrap: { flex: 1 },
  label: { color: colors.muted, fontSize: 12, marginBottom: 6 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 50,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  suffix: { color: colors.muted, fontSize: 12, fontWeight: "600" },
});
