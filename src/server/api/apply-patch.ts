import { MonetEDL, EDLPatch, EDLPatchOperation, MonetEDLSchema } from "../types/edl.js";

/**
 * Applies an EDLPatch to a MonetEDL and returns a new immutable version.
 * @param currentEDL The current EDL.
 * @param patch The patch containing operations to apply.
 * @returns A new MonetEDL instance.
 * @throws Error if validation fails or target is not found.
 */
export function applyPatch(currentEDL: MonetEDL, patch: EDLPatch): MonetEDL {
  // Deep clone the EDL to maintain immutability
  const newEDL: MonetEDL = JSON.parse(JSON.stringify(currentEDL));

  for (const op of patch.operations) {
    try {
      applyOperation(newEDL, op);
    } catch (error) {
      console.error(`Failed to apply operation: ${JSON.stringify(op)}`, error);
      // Depending on requirements, we might want to continue or throw.
      // The spec says "Correct or remove invalid ops" at generate-time, 
      // but apply-patch should be strict.
      throw error;
    }
  }

  // Final validation of the patched EDL
  const result = MonetEDLSchema.safeParse(newEDL);
  if (!result.success) {
    console.error("Patched EDL failed schema validation:", result.error);
    throw new Error("Patched EDL is invalid");
  }

  return newEDL;
}

function applyOperation(edl: MonetEDL, op: EDLPatchOperation) {
  switch (op.op) {
    case "modify":
      modifyElement(edl, op.target, op.property, op.value);
      break;
    case "add":
      addElement(edl, op.target, op.element);
      break;
    case "remove":
      removeElement(edl, op.target);
      break;
    case "reorder":
      reorderElement(edl, op.target, op.newIndex);
      break;
  }
}

function findElement(edl: MonetEDL, targetId: string): { container: any[], index: number, element: any } | { element: any } | null {
  // Check shots
  const shotIndex = edl.shots.findIndex(s => s.id === targetId);
  if (shotIndex !== -1) return { container: edl.shots, index: shotIndex, element: edl.shots[shotIndex] };

  // Check text overlays
  if (edl.textOverlays) {
    const textIndex = edl.textOverlays.findIndex(t => t.id === targetId);
    if (textIndex !== -1) return { container: edl.textOverlays, index: textIndex, element: edl.textOverlays[textIndex] };
  }

  // Check effects within shots
  for (const shot of edl.shots) {
    if (shot.effects) {
      // In MonetEDL, effects don't have IDs in the interface I saw, 
      // but the prompt says "effect_7". Let's assume they might have IDs or we target by type if unique.
      // Re-checking edl.ts... Effect interface DOES NOT have an ID.
      // But the prompt says "effect_7". This implies we might need to add IDs to effects or use a path.
      // For now, let's assume objects being targeted HAVE an 'id' property.
      const effectIndex = (shot.effects as any[]).findIndex(e => e.id === targetId);
      if (effectIndex !== -1) return { container: shot.effects, index: effectIndex, element: shot.effects[effectIndex] };
    }
  }

  // Check music
  if (edl.music && edl.music.id === targetId) {
    return { element: edl.music };
  }

  return null;
}

function modifyElement(edl: MonetEDL, target: string, property: string, value: any) {
  const found = findElement(edl, target);
  if (!found) throw new Error(`Target not found: ${target}`);

  // Handle nested properties if needed (e.g., "style.fontSize")
  const props = property.split(".");
  let obj = found.element;
  for (let i = 0; i < props.length - 1; i++) {
    const key = props[i];
    if (!(key in obj)) {
      // Safety check: Don't create random nested structures unless they are known containers
      const allowedContainers = ["style", "transform", "timing", "source", "compositing", "animation", "tracking", "params"];
      if (allowedContainers.includes(key)) {
        obj[key] = {};
      } else {
        throw new Error(`Property path ${property} contains invalid container ${key}`);
      }
    }
    obj = obj[key];
  }

  const finalKey = props[props.length - 1];
  obj[finalKey] = value;
}

function addElement(edl: MonetEDL, target: string, element: any) {
  // Target can be a container ID or a special keyword like "track_1" (shots)
  if (target === "shots" || target === "track_1") {
    edl.shots.push(element);
  } else if (target === "textOverlays") {
    if (!edl.textOverlays) edl.textOverlays = [];
    edl.textOverlays.push(element);
  } else {
    // Maybe adding an effect to a shot
    const found = findElement(edl, target);
    if (found && (found.element as any).effects) {
       (found.element as any).effects.push(element);
    } else {
      throw new Error(`Cannot add element to target: ${target}`);
    }
  }
}

function removeElement(edl: MonetEDL, target: string) {
  const found = findElement(edl, target);
  if (found && 'container' in found) {
    found.container.splice(found.index, 1);
  } else {
    throw new Error(`Cannot remove target: ${target} (not in a container or not found)`);
  }
}

function reorderElement(edl: MonetEDL, target: string, newIndex: number) {
  const found = findElement(edl, target);
  if (found && 'container' in found) {
    const [element] = found.container.splice(found.index, 1);
    found.container.splice(newIndex, 0, element);
  } else {
    throw new Error(`Cannot reorder target: ${target}`);
  }
}
