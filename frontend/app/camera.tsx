import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/src/theme";
import { flow } from "@/src/state";

export default function CameraScreen() {
  const router = useRouter();
  const camRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [facing, setFacing] = useState<"back" | "front">("back");

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="camera-outline" size={64} color={colors.brand} />
        <Text style={styles.permTitle}>Kamera izni gerekli</Text>
        <Text style={styles.permSub}>Odayı ölçüp perde yerleştirebilmek için kameraya erişim izni ver.</Text>
        <Pressable style={styles.permBtn} onPress={requestPermission} testID="cam-grant-btn">
          <Text style={styles.permBtnText}>İzin Ver</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: colors.muted }}>Geri Dön</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const shoot = async () => {
    if (!camRef.current || busy) return;
    try {
      setBusy(true);
      const photo = await camRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        skipProcessing: false,
      });
      if (photo?.base64) {
        flow.set({ original_image_base64: photo.base64 });
        router.replace("/measure");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <CameraView
        ref={(r) => {
          camRef.current = r;
        }}
        style={StyleSheet.absoluteFill}
        facing={facing}
        enableTorch={flashOn}
      />

      {/* Top bar */}
      <SafeAreaView edges={["top"]} style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="cam-close-btn">
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={styles.titlePill}>
          <Ionicons name="information-circle" size={14} color={colors.brand} />
          <Text style={styles.titleText}>Duvarın tamamı kadraja gelsin</Text>
        </View>
        <Pressable
          onPress={() => setFlashOn((v) => !v)}
          style={styles.iconBtn}
          testID="cam-flash-btn"
        >
          <Ionicons name={flashOn ? "flash" : "flash-off"} size={20} color="#fff" />
        </Pressable>
      </SafeAreaView>

      {/* Frame guide */}
      <View pointerEvents="none" style={styles.frameGuide} />

      {/* Bottom controls */}
      <SafeAreaView edges={["bottom"]} style={styles.bottomBar}>
        <View style={styles.controls}>
          <View style={styles.thumbPh} />
          <Pressable
            onPress={shoot}
            style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.96 }] }]}
            testID="cam-shutter-btn"
            disabled={busy}
          >
            <View style={styles.shutterInner}>
              {busy ? <ActivityIndicator color={colors.brand} /> : null}
            </View>
          </Pressable>
          <Pressable
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
            style={styles.iconBtn}
            testID="cam-swap-btn"
          >
            <Ionicons name="camera-reverse" size={22} color="#fff" />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  permTitle: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: "700",
    marginTop: spacing.md,
  },
  permSub: { color: colors.muted, textAlign: "center", marginTop: 6 },
  permBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  permBtnText: { color: colors.onBrand, fontWeight: "700" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  titlePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(0,212,228,0.35)",
  },
  titleText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  frameGuide: {
    position: "absolute",
    top: "22%",
    left: "10%",
    right: "10%",
    bottom: "22%",
    borderWidth: 1.5,
    borderColor: "rgba(0,212,228,0.55)",
    borderRadius: radius.lg,
  },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  thumbPh: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.brand,
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
