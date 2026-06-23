import { TransitionItem } from "../types";

export const Dissolve: TransitionItem = {
  id: "dissolve",
  type: "dissolve",
  duration: 0.5,
  aiRationale: "Standard smooth blend between two clips, useful for passage of time."
};

export const AdditiveDissolve: TransitionItem = {
  id: "additive-dissolve",
  type: "additive-dissolve",
  duration: 0.5,
  aiRationale: "Adds color information from clip B to clip A, and then subtracts the color information of clip A from clip B."
};

export const CrossDissolve: TransitionItem = {
  id: "cross-dissolve",
  type: "cross-dissolve",
  duration: 0.5,
  aiRationale: "Fades out clip A while fading in clip B. Works well at the beginning or end of a clip when you want to fade in or out from black."
};

export const DipToBlack: TransitionItem = {
  id: "dip-to-black",
  type: "dip-to-black",
  duration: 0.8,
  aiRationale: "Fades clip A to black and then fades from black to clip B. Using dip to black at the beginning or end of a clip will also affect a video on a lower track, something not always expected when a simple fade in/out of the targeted clip is wanted. The cross-dissolve transition may work better for this."
};

export const DipToWhite: TransitionItem = {
  id: "dip-to-white",
  type: "dip-to-white",
  duration: 0.8,
  aiRationale: "Fades clip A to white, then fades from white to clip B."
};

export const FilmDissolve: TransitionItem = {
  id: "film-dissolve",
  type: "film-dissolve",
  duration: 0.5,
  aiRationale: "Blends more realistically, and dissolves look the way they should. Blends in a linear color space (where gamma equals 1.0)."
};

export const MorphCut: TransitionItem = {
  id: "morph-cut",
  type: "morph-cut",
  duration: 0.3,
  aiRationale: "Creates a harmonious transition between two similar clips, usually of a person speaking. It analyses the frames and uses face tracking and interpolation to smooth over jump cuts, making it look like a continuous shot."
};

export const NonAdditiveDissolve: TransitionItem = {
  id: "non-additive-dissolve",
  type: "non-additive-dissolve",
  duration: 0.5,
  aiRationale: "Blends two clips by crossfading their pixel values without brightening the result, unlike standard dissolves that can create a glow or lighten overlapping areas. It makes a more neutral, natural-looking fade between clips."
};
