import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
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
import { flow } from "@/src/state";
import { colors, radius, spacing } from "@/src/theme";

const TYPE_FOR_TUMU = "Fon Perde";

const CUSTOM_ID = "__custom_texture__";

export default function CurtainSelectScreen() {
  const router = useRouter();
  const [curtains, setCurtains] = useState<Curtain[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("Tümü");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customTextureB64, setCustomTextureB64] = useState<string | null>(
    flow.get().custom_texture_base64,
  );
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    api
      .listCurtains()
      .then((c) => {
        setCurtains(c);
        setSelectedId(c[0]?.id ?? null);
      })
      .catch(() => setCurtains([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (filter === "Tümü" ? curtains : curtains.filter((c) => c.type === filter)),
    [filter, curtains],
  );

  const onPickTexture = async () => {
    try {
      setPicking(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.6,
      });
      if (res.canceled || !res.assets?.[0]?.base64) return;
      const b64 = res.assets[0].base64;
      setCustomTextureB64(b64);
      flow.set({ custom_texture_base64: b64 });
      setSelectedId(CUSTOM_ID);
    } finally {
      setPicking(false);
    }
  };

  const onApply = () => {
    if (selectedId === CUSTOM_ID && customTextureB64) {
      const type = filter === "Tümü" ? TYPE_FOR_TUMU : filter;
      const virtual: Curtain = {
        id: CUSTOM_ID,
        type,
        name: "Özel Texture",
        color: "Kullanıcı Yüklemesi",
        thumbnail_url: "",
        description: "Kullanıcının yüklediği özel kumaş görseli",
      };
      flow.set({ curtain: virtual, custom_texture_base64: customTextureB64 });
      router.push("/preview");
      return;
    }
    const chosen = curtains.find((c) => c.id === selectedId);
    if (!chosen) return;
    flow.set({ curtain: chosen, custom_texture_base64: null });
    setCustomTextureB64(null);
    router.push("/preview");
  };

  const data = useMemo(() => {
    const customTile: Curtain = {
      id: CUSTOM_ID,
      type: filter === "Tümü" ? TYPE_FOR_TUMU : filter,
      name: customTextureB64 ? "Yüklenen Texture" : "Kendi Texture'ını Yükle",
      color: "",
      thumbnail_url: "",
      description: "",
    };
    return [customTile, ...filtered];
  }, [filtered, customTextureB64, filter]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="cs-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Perde Seçimi</Text>
        <View style={styles.iconBtn} />
      </View>

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
                testID={`cs-chip-${f}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Text style={styles.hintText}>
        {filter === "Tümü"
          ? "Tüm perde tipleri — özel texture Fon Perde olarak uygulanır"
          : filter === "Gunesilik"
            ? "Güneşlik — tülün ARKASINA, pencereye yerleşir"
            : filter === "Ahsap Jaluzi"
              ? "Ahşap Jaluzi — pencere içine oturur; üzerine Rustik / Broçallı ekleyebilirsin"
              : filter === "Rustik"
                ? "Rustik — jaluzi veya tülün ÖNÜNE, kornişe asılır"
                : `${typeLabel(filter)} — hazır veya kendi texture'ın ile dene`}
      </Text>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          numColumns={3}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: spacing.sm }}
          renderItem={({ item }) => {
            const isCustom = item.id === CUSTOM_ID;
            const active = item.id === selectedId;
            if (isCustom) {
              return (
                <Pressable
                  onPress={() => (customTextureB64 ? setSelectedId(CUSTOM_ID) : onPickTexture())}
                  onLongPress={onPickTexture}
                  style={[styles.tile, styles.customTile, active && styles.tileActive]}
                  testID="cs-tile-custom"
                >
                  {customTextureB64 ? (
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${customTextureB64}` }}
                      style={styles.tileImg}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.tileImg, styles.customPlaceholder]}>
                      {picking ? (
                        <ActivityIndicator color={colors.brand} />
                      ) : (
                        <Ionicons name="add-circle" size={28} color={colors.brand} />
                      )}
                    </View>
                  )}
                  {active ? (
                    <View style={styles.check}>
                      <Ionicons name="checkmark" size={14} color={colors.onBrand} />
                    </View>
                  ) : null}
                  <View style={styles.tileFoot}>
                    <Text style={styles.tileName} numberOfLines={1}>
                      {customTextureB64 ? "Özel Texture" : "Yükle"}
                    </Text>
                    {customTextureB64 ? (
                      <Pressable onPress={onPickTexture} hitSlop={8} testID="cs-change-custom">
                        <Text style={styles.changeLink}>Değiştir</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Pressable>
              );
            }
            return (
              <Pressable
                onPress={() => setSelectedId(item.id)}
                style={[styles.tile, active && styles.tileActive]}
                testID={`cs-tile-${item.id}`}
              >
                <Image source={{ uri: item.thumbnail_url }} style={styles.tileImg} contentFit="cover" />
                {active ? (
                  <View style={styles.check}>
                    <Ionicons name="checkmark" size={14} color={colors.onBrand} />
                  </View>
                ) : null}
                <View style={styles.tileFoot}>
                  <Text style={styles.tileName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <View style={styles.footer}>
        <Pressable
          onPress={onApply}
          disabled={!selectedId}
          style={[styles.primaryBtn, !selectedId && { opacity: 0.5 }]}
          testID="cs-apply"
        >
          <Text style={styles.primaryText}>
            {selectedId === CUSTOM_ID ? "Özel Texture'ı Uygula" : "Bu Perdeyi Uygula"}
          </Text>
        </Pressable>
      </View>
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
  hintText: {
    color: colors.muted,
    fontSize: 12,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  grid: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 120,
    gap: spacing.sm,
  },
  tile: {
    flex: 1 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    maxWidth: "33%",
  },
  customTile: { borderStyle: "dashed", borderColor: colors.brandDim },
  tileActive: { borderColor: colors.brand, borderStyle: "solid" },
  tileImg: { width: "100%", aspectRatio: 1 },
  customPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  tileFoot: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
  tileName: { color: colors.onSurface, fontSize: 12, fontWeight: "600" },
  changeLink: { color: colors.brand, fontSize: 11, fontWeight: "700", marginTop: 2 },
  check: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  primaryBtn: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
  },
  primaryText: { color: colors.onBrand, fontWeight: "800", fontSize: 15 },
});
