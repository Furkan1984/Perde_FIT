// In-memory shared state for the capture -> measure -> select -> preview flow.
// Kept simple to avoid pulling in a state library. Screens read/write via the
// exported functions; expo-router navigation only carries an ephemeral flag.

import type { Curtain, Measurement } from "./api";

export type LayerEntry = {
  curtain: Curtain;
  custom_texture_base64: string | null;
};

export type FlowState = {
  original_image_base64: string | null;
  measurement: Measurement | null;
  curtain: Curtain | null;
  custom_texture_base64: string | null;
  rendered_image_base64: string | null;
  layer_count: number;
  layers: LayerEntry[];
};

let state: FlowState = {
  original_image_base64: null,
  measurement: null,
  curtain: null,
  custom_texture_base64: null,
  rendered_image_base64: null,
  layer_count: 0,
  layers: [],
};

export const flow = {
  get: () => state,
  set: (patch: Partial<FlowState>) => {
    state = { ...state, ...patch };
  },
  reset: () => {
    state = {
      original_image_base64: null,
      measurement: null,
      curtain: null,
      custom_texture_base64: null,
      rendered_image_base64: null,
      layer_count: 0,
      layers: [],
    };
  },
};
