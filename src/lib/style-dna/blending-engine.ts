import type {
  StyleDNA, StyleBlendMode, ColorGradeSpec, EffectInstance,
  ChromaticAberrationSpec, TempoDescription, RGBVector, TextColorMode,
} from "./types";

export interface BlendRecipe {
  primary: StyleDNA;
  secondary: StyleDNA;
  ratio: number;              // 0.0 = 100% primary, 1.0 = 100% secondary, 0.5 = equal
  mode: StyleBlendMode;
  conflictResolution: "primary_wins" | "secondary_wins" | "merge" | "union";
}

export class StyleBlender {
  
  /**
   * Main blending function
   */
  blend(styles: StyleDNA[], userIntent: string = ""): StyleDNA {
    if (styles.length === 0) throw new Error("No styles to blend");
    if (styles.length === 1) return styles[0];
    
    // Determine blend mode from intent keywords
    const mode = this.detectBlendMode(userIntent);
    
    // Start with first style as base
    let result: StyleDNA = JSON.parse(JSON.stringify(styles[0])); // Deep copy
    
    // Iterate through additional styles
    for (let i = 1; i < styles.length; i++) {
      const secondary = styles[i];
      const ratio = 1.0 / styles.length; // Equal weighting by default
      
      result = this.blendTwo(result, secondary, ratio, mode);
    }
    
    // Post-blend normalization (ensure values stay in valid ranges)
    result = this.normalize(result);
    
    // Generate composite ID and metadata
    result.id = `blended_${styles.map(s => s.id).join("_plus_")}`;
    result.name = styles.map(s => s.name).join(" × ");
    result.sourceInfluences = [...new Set(styles.flatMap(s => s.sourceInfluences))];
    result.tags = [...new Set(styles.flatMap(s => s.tags))];
    result.confidence = Math.min(...styles.map(s => s.confidence)) * 0.9; // Blending reduces certainty slightly
    
    return result;
  }
  
  private detectBlendMode(intent: string): StyleBlendMode {
    const lower = intent.toLowerCase();
    
    if (lower.includes("meets") || lower.includes("mix") || lower.includes("blend")) {
      return "crossfade";
    }
    if (lower.includes("but") || lower.includes("with a twist") || lower.includes("touch of")) {
      return "layered";  // Primary base, secondary accent
    }
    if (lower.includes("mashup") || lower.includes("vs") || lower.includes("versus")) {
      return "collision";
    }
    if (lower.includes("structure of") || lower.includes("pacing of")) {
      return "structural_mix";
    }
    
    // Default
    return "crossfade";
  }
  
  private blendTwo(primary: StyleDNA, secondary: StyleDNA, ratio: number, mode: StyleBlendMode): StyleDNA {
    const result = JSON.parse(JSON.stringify(primary)); // Copy primary
    
    switch(mode) {
      case "crossfade":
        return this.crossfadeBlend(result, secondary, ratio);
        
      case "layered":
        return this.layeredBlend(result, secondary, ratio);
        
      case "structural_mix":
        return this.structuralMix(result, secondary, ratio);
        
      case "collision":
        return this.collisionBlend(result, secondary);
        
      case "masked":
        return this.maskedBlend(result, secondary, ratio);
        
      default:
        return this.crossfadeBlend(result, secondary, ratio);
    }
  }
  
  /**
   * CROSSFADE: Smooth interpolation between all parameters
   * Best for: Similar genres (e.g., "Film Noir + Detective Comic")
   */
  private crossfadeBlend(a: StyleDNA, b: StyleDNA, t: number): StyleDNA {
    const result = a;
    
    // Grade: Linear interpolation for most params
    result.grade.lift = this.lerpVec(a.grade.lift, b.grade.lift, t);
    result.grade.gamma = this.lerpVec(a.grade.gamma, b.grade.gamma, t);
    result.grade.gain = this.lerpVec(a.grade.gain, b.grade.gain, t);
    result.grade.saturation = this.lerp(a.grade.saturation, b.grade.saturation, t);
    result.grade.contrast = this.lerp(a.grade.contrast, b.grade.contrast, t);
    result.grade.temperature = this.lerp(a.grade.temperature, b.grade.temperature, t);
    
    // NULL GUARD: grain might not exist on either
    if (a.grade.grain && b.grade.grain) {
      result.grade.grain = {
        intensity: this.lerp(a.grade.grain.intensity, b.grade.grain.intensity, t),
        size: this.lerp(a.grade.grain.size, b.grade.grain.size, t),
        color: t > 0.5 ? b.grade.grain.color : a.grade.grain.color,
        temporal: a.grade.grain.temporal || b.grade.grain.temporal,
      };
    } else if (b.grade.grain && t > 0.5) {
      result.grade.grain = { ...b.grade.grain };
    }
    
    // Effects: Merge stacks, interpolate intensities
    result.globalEffects.effects = this.mergeEffectStacks(
      a.globalEffects.effects, 
      b.globalEffects.effects, 
      t
    );
    
    // Timing: Interpolate
    if (typeof a.timing.frameRateFeel !== typeof b.timing.frameRateFeel) {
      // Different types (e.g., normal vs limited): favor primary unless t > 0.7
      result.timing.frameRateFeel = t > 0.7 ? b.timing.frameRateFeel : a.timing.frameRateFeel;
    }
    result.timing.averageShotDurationSec = this.lerp(
      a.timing.averageShotDurationSec, 
      b.timing.averageShotDurationSec, 
      t
    );
    
    // Camera: Interpolate energy
    result.camera.energy = t > 0.5 ? b.camera.energy : a.camera.energy;
    result.camera.movement.amplitude = this.lerp(
      a.camera.movement.amplitude, 
      b.camera.movement.amplitude, 
      t
    );
    
    // Text: Blend placement and color
    result.graphics.text.placement = t > 0.5 ? b.graphics.text.placement : a.graphics.text.placement;
    result.graphics.text.colorMode = this.lerpColorMode(
      a.graphics.text.colorMode, 
      b.graphics.text.colorMode, 
      t
    );
    
    // Editorial: Interpolate shot durations
    result.editorial.avgShotDurationSec = this.lerp(
      a.editorial.avgShotDurationSec, 
      b.editorial.avgShotDurationSec, 
      t
    );
    result.editorial.closeupBias = this.lerp(a.editorial.closeupBias, b.editorial.closeupBias, t);
    
    return result;
  }
  
  /**
   * LAYERED: Keep primary's structure, add secondary's visual flavor as overlay
   * Best for: "X with a touch of Y" (e.g., "Documentary with cyberpunk neon")
   */
  private layeredBlend(base: StyleDNA, accent: StyleDNA, strength: number): StyleDNA {
    const result = base;
    
    // Push grade toward accent, but gently
    result.grade.saturation = this.lerp(base.grade.saturation, accent.grade.saturation, strength * 0.5);
    result.grade.contrast = this.lerp(base.grade.contrast, accent.grade.contrast, strength * 0.3);
    
    // Add accent's effects to global stack (reduced intensity)
    accent.globalEffects.effects.forEach(effect => {
      const existing = result.globalEffects.effects.find(e => e.type === effect.type);
      if (!existing) {
        // New effect: add at reduced power
        const cloned = {...effect};
        (cloned.params as any).intensity = ((cloned.params as any)?.intensity || 1.0) * strength * 0.6;
        result.globalEffects.effects.push(cloned);
      }
    });
    
    // Add accent's bloom/chromatic if strong
    if (accent.grade.bloom && accent.grade.bloom.intensity > 0.2) {
      if (!result.grade.bloom) result.grade.bloom = { intensity: 0, threshold: 0.8, radius: 10, softness: 0.8, color: null };
      result.grade.bloom.intensity += accent.grade.bloom.intensity * strength * 0.4;
    }
    
    // Text: Base's placement, accent's color/animation hints
    if (strength > 0.5) {
      result.graphics.text.animation = accent.graphics.text.animation;
    }
    
    return result;
  }
  
  /**
   * STRUCTURAL MIX: Take timing/editorial from primary, visuals from secondary
   * Best for: "The pacing of X, but looking like Y"
   */
  private structuralMix(structureBase: StyleDNA, visualSource: StyleDNA, t: number): StyleDNA {
    const result = JSON.parse(JSON.stringify(visualSource)); // Start with visual source
    
    // Overwrite structural elements with base
    result.timing = JSON.parse(JSON.stringify(structureBase.timing));
    result.editorial = JSON.parse(JSON.stringify(structureBase.editorial));
    result.camera.energy = structureBase.camera.energy;
    result.camera.movement = structureBase.camera.movement;
    
    // Keep visual source's grade, effects, graphics styling
    result.graphics.text.placement = structureBase.graphics.text.placement;
    
    return result;
  }
  
  /**
   * COLLISION: Both at full intensity, union of all effects
   * Best for: Mashups, chaotic combinations, "X vs Y"
   */
  private collisionBlend(a: StyleDNA, b: StyleDNA): StyleDNA {
    const result = JSON.parse(JSON.stringify(a));
    
    // Take the MORE EXTREME value for each param (max, not average)
    result.grade.saturation = Math.max(a.grade.saturation, b.grade.saturation);
    result.grade.contrast = Math.max(a.grade.contrast, b.grade.contrast);
    result.grade.chromaticAberration = this.maxChromaticAberration(
      a.grade.chromaticAberration, 
      b.grade.chromaticAberration
    );
    
    // Union of effect stacks (both full force)
    result.globalEffects.effects = [
      ...a.globalEffects.effects.map(e => ({...e})),
      ...b.globalEffects.effects.map(e => ({...e}))
    ];
    
    // Union of hero effects
    result.heroEffects.effects = [
      ...a.heroEffects.effects.map(e => ({...e})),
      ...b.heroEffects.effects.map(e => ({...e}))
    ];
    
    // Take faster tempo
    const aTempo = this.tempoToNumber(a.timing.tempo);
    const bTempo = this.tempoToNumber(b.timing.tempo);
    result.timing.tempo = aTempo > bTempo ? a.timing.tempo : b.timing.tempo;
    result.timing.averageShotDurationSec = Math.min(
      a.timing.averageShotDurationSec, 
      b.timing.averageShotDurationSec
    ); // Faster wins
    
    // Combine tags
    result.tags = [...new Set([...a.tags, ...b.tags])];
    
    return result;
  }
  
  /**
   * MASKED: Apply secondary style ONLY during hero/high-energy moments
   * Good for: "Mostly X, but Y during drops/climaxes"
   */
  private maskedBlend(base: StyleDNA, accent: StyleDNA, strength: number): StyleDNA {
    const result = base;
    
    // Base stays exactly as-is for global/normal moments
    // Accent goes entirely into heroEffects (which only fire on hero shots)
    
    // Move accent's global effects into result's hero effects
    accent.globalEffects.effects.forEach(effect => {
      const cloned = {...effect};
      result.heroEffects.effects.push(cloned);
    });
    
    // Also take accent's grade extremes for hero moments
    result.heroEffects.overallIntensity = 1.0 + (strength * 0.5);
    
    // Mark that this is a masked blend so renderer knows to apply heroEffects conditionally
    (result as any)._maskedBlend = true;
    (result as any)._accentStyle = accent.id;
    
    return result;
  }
  
  // === UTILITY FUNCTIONS ===
  
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
  
  private lerpVec(a: RGBVector, b: RGBVector, t: number): RGBVector {
    return [
      this.lerp(a[0], b[0], t),
      this.lerp(a[1], b[1], t),
      this.lerp(a[2], b[2], t)
    ];
  }
  
  private lerpColorMode(a: TextColorMode, b: TextColorMode, t: number): TextColorMode {
    if (a.type === "solid" && b.type === "solid") {
      return { type: "solid", color: this.lerpVec(a.color, b.color, t) };
    }
    if (a.type === "neon_glow" && b.type === "neon_glow") {
      return {
        type: "neon_glow",
        coreColor: this.lerpVec(a.coreColor, b.coreColor, t),
        glowColor: this.lerpVec(a.glowColor, b.glowColor, t),
        glowSize: this.lerp(a.glowSize, b.glowSize, t)
      };
    }
    return t > 0.5 ? b : a;
  }
  
  private mergeEffectStacks(
    a: EffectInstance[], 
    b: EffectInstance[], 
    t: number
  ): EffectInstance[] {
    const merged: EffectInstance[] = [];
    
    // Copy all from A
    a.forEach(effect => merged.push({...effect}));
    
    // For each in B, either merge with existing same-type or add new
    b.forEach(bEffect => {
      const existing = merged.find(e => e.type === bEffect.type);
      if (existing) {
        // Merge parameters (average intensities)
        Object.keys(bEffect.params).forEach(key => {
          if (typeof bEffect.params[key] === 'number' && typeof existing.params[key] === 'number') {
            (existing.params as any)[key] = this.lerp(
              (existing.params as any)[key], 
              (bEffect.params as any)[key], 
              t
            );
          }
        });
      } else {
        // New effect: add with reduced intensity
        const cloned = {...bEffect};
        if (cloned.params.intensity) {
          (cloned.params as any).intensity *= (0.5 + t * 0.5);
        }
        merged.push(cloned);
      }
    });
    
    return merged;
  }
  
  private maxChromaticAberration(a: ChromaticAberrationSpec | null, b: ChromaticAberrationSpec | null): ChromaticAberrationSpec | null {
    if (!a && !b) return null;
    if (!a) return b;
    if (!b) return a;
    return {
      intensity: Math.max(a.intensity, b.intensity),
      angle: b.angle, // Use secondary's angle for variety
      radial: a.radial || b.radial,
      channelOffsets: a.channelOffsets || b.channelOffsets
    };
  }
  
  private tempoToNumber(tempo: TempoDescription): number {
    const map: Record<TempoDescription, number> = {
      "static": 1,
      "leisurely": 2,
      "moderate": 3,
      "brisk": 4,
      "frantic": 5,
      "musical": 3.5,
      "staccato": 4.5,
      "breathing": 2.5,
      "climax_heavy": 4,
      "rollercoaster": 4.2,
      "leisurely_to_brisk": 3.2
    };
    return map[tempo] || 3;
  }
  
  /**
   * Ensure all values are within valid ranges after blending
   */
  private normalize(style: StyleDNA): StyleDNA {
    // Clamp all numeric values to reasonable ranges
    style.grade.saturation = Math.max(0, Math.min(2.5, style.grade.saturation));
    style.grade.contrast = Math.max(0.3, Math.min(3.0, style.grade.contrast));
    style.grade.temperature = Math.max(-50, Math.min(50, style.grade.temperature));
    
    if (style.grade.grain) {
      style.grade.grain.intensity = Math.max(0, Math.min(1.0, style.grade.grain.intensity));
    }
    
    if (style.timing.averageShotDurationSec) {
      style.timing.averageShotDurationSec = Math.max(0.15, Math.min(30.0, style.timing.averageShotDurationSec));
    }
    
    style.editorial.closeupBias = Math.max(0, Math.min(1, style.editorial.closeupBias));
    
    // Ensure effect intensities don't exceed 2.0 (even collision mode shouldn't go insane)
    style.globalEffects.effects.forEach(effect => {
      if (effect.params.intensity) {
        effect.params.intensity = Math.min(2.0, effect.params.intensity as number);
      }
    });
    
    return style;
  }
}

// Export singleton
export const styleBlender = new StyleBlender();
