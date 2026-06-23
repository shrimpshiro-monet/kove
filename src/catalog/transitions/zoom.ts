import { TransitionItem } from "../types";

export const Zoom: TransitionItem = { id: "zoom", type: "zoom", duration: 0.4, aiRationale: "Quickly zooms into the incoming clip to create a dynamic shift in perspective." };
export const CrossZoom: TransitionItem = { id: "cross-zoom", type: "cross-zoom", duration: 0.5, aiRationale: "Zooms out of the outgoing clip and zooms into the incoming clip, creating a continuous motion effect." };
