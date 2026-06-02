/**
 * A time-anchored annotation the user leaves on the preview player.
 *
 * When a user pauses playback and types "hard zoom here" or "wrong clip",
 * Monet records which shot they were on and their exact instruction.
 * These annotations are sent alongside global feedback to /api/refine-edl,
 * where Gemini applies them surgically — only the referenced shot changes.
 */
export interface TimelineAnnotation {
  /** Unique ID for this annotation */
  id: string;
  /** Position in the timeline (seconds) when the user paused */
  timestamp: number;
  /** `shot.id` of the shot active at `timestamp` */
  shotId: string;
  /** 0-based index of that shot in `edl.shots` */
  shotIndex: number;
  /** The user's instruction: "zoom here", "cut shorter", "different clip", etc. */
  text: string;
  /** Unix ms when this annotation was created */
  createdAt: number;
}
