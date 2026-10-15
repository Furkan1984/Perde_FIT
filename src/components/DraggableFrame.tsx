import { useMemo, useRef } from "react";
import { PanResponder, StyleSheet, View, type PanResponderInstance, type ViewStyle } from "react-native";

import type { BBox } from "@/src/api";

const MIN = 0.05; // minimum normalised frame size
const HANDLE = 32; // corner handle touch target
const EDGE_W = 44; // edge handle long side
const EDGE_T = 24; // edge handle short side (touch)
const PAD = HANDLE / 2; // outer padding so handles stay inside the touchable bounds (Android)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Mode = "move" | "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";
const MODES: Mode[] = ["move", "tl", "tr", "bl", "br", "t", "b", "l", "r"];

type Props = {
  box: BBox;
  width: number; // container size in px
  height: number;
  color: string;
  dashed?: boolean;
  onChange: (b: BBox) => void;
  onDragging?: (dragging: boolean) => void;
  testID?: string;
};

/**
 * A normalised (0..1) rectangle drawn over an image that can be moved by
 * dragging its body and resized from its four corners or four edges.
 * Handles are rendered inside a padded wrapper so touches register on Android,
 * which does not deliver touches to children outside the parent's bounds.
 */
export function DraggableFrame({ box, width, height, color, dashed, onChange, onDragging, testID }: Props) {
  const boxRef = useRef(box);
  boxRef.current = box;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDraggingRef = useRef(onDragging);
  onDraggingRef.current = onDragging;
  const startRef = useRef<BBox>(box);

  const responders = useMemo(() => {
    const make = (mode: Mode) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          startRef.current = boxRef.current;
          onDraggingRef.current?.(true);
        },
        onPanResponderMove: (_e, g) => {
          if (width <= 0 || height <= 0) return;
          const dx = g.dx / width;
          const dy = g.dy / height;
          const s = startRef.current;
          let b: BBox;
          if (mode === "move") {
            const w = s.x2 - s.x1;
            const h = s.y2 - s.y1;
            const x1 = clamp(s.x1 + dx, 0, 1 - w);
            const y1 = clamp(s.y1 + dy, 0, 1 - h);
            b = { x1, y1, x2: x1 + w, y2: y1 + h };
          } else {
            b = { ...s };
            if (mode.includes("l")) b.x1 = clamp(s.x1 + dx, 0, s.x2 - MIN);
            if (mode.includes("r")) b.x2 = clamp(s.x2 + dx, s.x1 + MIN, 1);
            if (mode.includes("t")) b.y1 = clamp(s.y1 + dy, 0, s.y2 - MIN);
            if (mode.includes("b")) b.y2 = clamp(s.y2 + dy, s.y1 + MIN, 1);
          }
          onChangeRef.current(b);
        },
        onPanResponderRelease: () => onDraggingRef.current?.(false),
        onPanResponderTerminate: () => onDraggingRef.current?.(false),
      });
    return Object.fromEntries(MODES.map((m) => [m, make(m)])) as Record<Mode, PanResponderInstance>;
  }, [width, height]);

  const wrapStyle: ViewStyle = {
    left: box.x1 * width - PAD,
    top: box.y1 * height - PAD,
    width: (box.x2 - box.x1) * width + PAD * 2,
    height: (box.y2 - box.y1) * height + PAD * 2,
  };
  const borderStyle: ViewStyle = { borderColor: color, borderStyle: dashed ? "dashed" : "solid" };
  const tint = { borderColor: color };

  return (
    <View style={[styles.wrap, wrapStyle]} testID={testID}>
      {/* Body: move */}
      <View style={[styles.body, borderStyle]} {...responders.move.panHandlers} />
      {/* Edges: resize one side */}
      <View style={[styles.edge, styles.edgeT, tint]} {...responders.t.panHandlers}>
        <View style={[styles.edgeBar, { backgroundColor: color }]} />
      </View>
      <View style={[styles.edge, styles.edgeB, tint]} {...responders.b.panHandlers}>
        <View style={[styles.edgeBar, { backgroundColor: color }]} />
      </View>
      <View style={[styles.edge, styles.edgeL, tint]} {...responders.l.panHandlers}>
        <View style={[styles.edgeBarV, { backgroundColor: color }]} />
      </View>
      <View style={[styles.edge, styles.edgeR, tint]} {...responders.r.panHandlers}>
        <View style={[styles.edgeBarV, { backgroundColor: color }]} />
      </View>
      {/* Corners: resize two sides */}
      <View style={[styles.handle, styles.tl, tint]} {...responders.tl.panHandlers} />
      <View style={[styles.handle, styles.tr, tint]} {...responders.tr.panHandlers} />
      <View style={[styles.handle, styles.bl, tint]} {...responders.bl.panHandlers} />
      <View style={[styles.handle, styles.br, tint]} {...responders.br.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute" },
  body: { position: "absolute", left: PAD, top: PAD, right: PAD, bottom: PAD, borderWidth: 2 },
  handle: {
    position: "absolute",
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    borderWidth: 2,
    backgroundColor: "rgba(9,9,11,0.8)",
  },
  tl: { left: 0, top: 0 },
  tr: { right: 0, top: 0 },
  bl: { left: 0, bottom: 0 },
  br: { right: 0, bottom: 0 },
  edge: { position: "absolute", alignItems: "center", justifyContent: "center" },
  edgeT: { top: PAD - EDGE_T / 2, left: "50%", marginLeft: -EDGE_W / 2, width: EDGE_W, height: EDGE_T },
  edgeB: { bottom: PAD - EDGE_T / 2, left: "50%", marginLeft: -EDGE_W / 2, width: EDGE_W, height: EDGE_T },
  edgeL: { left: PAD - EDGE_T / 2, top: "50%", marginTop: -EDGE_W / 2, width: EDGE_T, height: EDGE_W },
  edgeR: { right: PAD - EDGE_T / 2, top: "50%", marginTop: -EDGE_W / 2, width: EDGE_T, height: EDGE_W },
  edgeBar: { width: 28, height: 6, borderRadius: 3 },
  edgeBarV: { width: 6, height: 28, borderRadius: 3 },
});
