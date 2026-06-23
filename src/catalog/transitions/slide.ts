import { TransitionItem } from "../types";

export const BandSlide: TransitionItem = { id: "band-slide", type: "band-slide", duration: 0.5, aiRationale: "Incoming shot slides over the outgoing shot in horizontal or vertical bands." };
export const CenterSplit: TransitionItem = { id: "center-split", type: "center-split", duration: 0.5, aiRationale: "Outgoing shot splits in the middle and slides off to reveal the incoming shot." };
export const Push: TransitionItem = { id: "push", type: "push", duration: 0.5, aiRationale: "Incoming shot pushes the outgoing shot off the screen." };
export const Slide: TransitionItem = { id: "slide", type: "slide", duration: 0.5, aiRationale: "Incoming shot slides over the outgoing shot." };
export const Split: TransitionItem = { id: "split", type: "split", duration: 0.5, aiRationale: "Like center split, but can go from the edges inwards to conceal the outgoing shot." };
export const Whip: TransitionItem = { id: "whip", type: "whip", duration: 0.3, aiRationale: "Fast directional movement to maintain momentum between high-action shots." };
