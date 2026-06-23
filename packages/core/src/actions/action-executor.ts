import { importProjectAction } from "./import-project";
import {
  removeClipEffectAction,
  updateClipTransformsAction,
  upsertClipEffectAction,
} from "./monet-effect-actions";

// This is a mock registry. The user should replace this with their actual implementation.
const registry = {
  _actions: new Map<string, Function>(),
  register: function (name: string, action: Function) {
    this._actions.set(name, action);
  },
};

registry.register("IMPORT_PROJECT", importProjectAction);
registry.register("MONET_UPSERT_CLIP_EFFECT", upsertClipEffectAction);
registry.register("MONET_REMOVE_CLIP_EFFECT", removeClipEffectAction);
import { enforceMinimumClipDurationAction } from "./monet-timeline-guards";
import { attachSpatialAnalysisAction } from "./monet-spatial-actions";

registry.register("MONET_UPDATE_CLIP_TRANSFORMS", updateClipTransformsAction);
registry.register("MONET_ENFORCE_MINIMUM_CLIP_DURATION", enforceMinimumClipDurationAction);
registry.register("MONET_ATTACH_SPATIAL_ANALYSIS", attachSpatialAnalysisAction);
