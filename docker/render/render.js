#!/usr/bin/env node
/**
 * Render script for Docker container.
 * Uses FFmpeg with xfade transitions, color grading, beat alignment,
 * and importance-based duration scaling.
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } = require('fs');
const { join } = require('path');
const { execSync } = require('child_process');
const { tmpdir } = require('os');

const EDL_PATH = process.env.EDL_PATH || '/data/edl.json';
const OUTPUT_PATH = process.env.OUTPUT_PATH || '/data/output.mp4';
const FOOTAGE_DIR = process.env.FOOTAGE_DIR || '/data/footage';

const TRANSITION_MAP = {
  'fade': 'fade',
  'fade_white': 'fade',
  'crossfade': 'fade',
  'glitch': 'fadeblack',
  'wipe': 'wipeleft',
  'zoom-blur': 'circleopen',
  'flash': 'fadeblack',
  'whip-pan': 'slideright',
  'dissolve': 'dissolve',
  'blur': 'fadeblack',
};

const GRADE_FILTERS = {
  'desaturated': 'eq=saturation=0.35:contrast=1.05',
  'vibrant': 'eq=saturation=1.5:contrast=1.1',
  'dark': 'eq=brightness=-0.1:contrast=1.2:saturation=0.8',
  'bright': 'eq=brightness=0.1:contrast=0.9',
  'bw': 'eq=saturation=0',
  'normal': '',
};

function snapToBeats(inPoint, beats, tolerance) {
  if (!beats || beats.length === 0 || !tolerance) return inPoint;
  let best = inPoint;
  let bestDist = tolerance;
  for (const beat of beats) {
    const dist = Math.abs(inPoint - beat);
    if (dist < bestDist) {
      bestDist = dist;
      best = beat;
    }
  }
  return best;
}

function render() {
  console.log('=== Monet Docker Render (FFmpeg xfade + grade) ===');
  
  if (!existsSync(EDL_PATH)) {
    console.error(`Error: EDL not found: ${EDL_PATH}`);
    process.exit(1);
  }
  
  const edl = JSON.parse(readFileSync(EDL_PATH, 'utf-8'));
  const clips = edl.timeline?.tracks?.[0]?.clips || [];
  const dna = edl._dna || {};
  const grade = dna.colorProfile?.grade || 'normal';
  const beats = dna.audioAnalysis?.beats || [];
  const gradeFilter = GRADE_FILTERS[grade] || '';
  console.log(`EDL loaded: ${clips.length} clips, grade: ${grade}, beats: ${beats.length}`);
  
  // Find footage
  let footageFile = null;
  for (const f of readdirSync(FOOTAGE_DIR)) {
    if (f.endsWith('.mp4') || f.endsWith('.MP4')) {
      footageFile = join(FOOTAGE_DIR, f);
      break;
    }
  }
  if (!footageFile) { console.error('No footage found'); process.exit(1); }
  console.log(`Footage: ${footageFile}`);
  
  const tmpDir = join(tmpdir(), 'monet-' + Date.now());
  mkdirSync(tmpDir, { recursive: true });
  
  // Step 1: Extract clips with effects, grade, speed
  console.log('\n[1/2] Extracting clips...');
  const segments = [];
  
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const segPath = join(tmpDir, `seg_${String(i).padStart(3, '0')}.mp4`);
    
    // Snap inPoint to nearest beat (100ms tolerance)
    let inPoint = clip.inPoint;
    if (beats.length > 0) {
      inPoint = snapToBeats(inPoint, beats, 0.1);
    }
    
    // Scale duration by importance (high >7 = longer, low <4 = shorter)
    let duration = clip.duration;
    const importance = clip.meta?.semanticEvent?.importance || 5;
    if (importance >= 7) {
      duration = Math.min(duration * 1.3, duration + 0.5);
    } else if (importance <= 3) {
      duration = Math.max(duration * 0.6, 0.15);
    }
    
    // Build filter chain
    const filters = ['scale=576:576:force_original_aspect_ratio=decrease,pad=576:576:(ow-iw)/2:(oh-ih)/2'];
    
    // Color grade
    if (gradeFilter) filters.push(gradeFilter);
    
    // Effects (max 1, deduplicated)
    const uniqueEffects = [...new Set((clip.effects || []).map(e => e.type).filter(e => e && e !== 'cut'))].slice(0, 1);
    for (const effect of uniqueEffects) {
      switch (effect) {
        case 'blur': filters.push('boxblur=8:8'); break;
        case 'vignette': filters.push('vignette=PI/4'); break;
        case 'flash': filters.push('eq=brightness=0.3'); break;
        case 'desaturation': filters.push('eq=saturation=0.3'); break;
        case 'glow': filters.push('unsharp=5:5:1.5'); break;
        case 'shake': filters.push('crop=w=in_w-10:h=in_h-10:x=5:y=5'); break;
      }
    }
    
    // Speed filter
    const speed = clip.speed || 1.0;
    if (speed !== 1.0) {
      filters.push(`setpts=${(1/speed).toFixed(3)}*PTS`);
    }
    
    try {
      execSync(`ffmpeg -y -ss ${inPoint} -i "${footageFile}" -t ${duration.toFixed(3)} -vf "${filters.join(',')}" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -r 30 -an "${segPath}"`, {
        stdio: 'pipe', timeout: 30000
      });
      segments.push({ path: segPath, duration: duration, transition: clip.transition });
      const impTag = importance >= 7 ? ' ★' : importance <= 3 ? ' ▽' : '';
      console.log(`  ${i+1}/${clips.length}: ${duration.toFixed(2)}s (imp:${importance})${impTag}`);
    } catch (e) {
      console.warn(`  Skip ${i+1}: ${e.message.substring(0, 60)}`);
    }
  }
  
  if (segments.length === 0) { console.error('No segments'); process.exit(1); }
  
  // Step 2: Render with xfade
  console.log('\n[2/2] Rendering with transitions...');
  
  if (segments.length === 1) {
    execSync(`cp "${segments[0].path}" "${OUTPUT_PATH}"`, { stdio: 'pipe' });
    console.log('✓ Single clip, copied directly');
  } else {
    let currentFile = segments[0].path;
    let currentDuration = segments[0].duration;
    let transitionCount = 0;
    
    for (let i = 1; i < segments.length; i++) {
      const nextFile = segments[i].path;
      const nextDuration = segments[i].duration;
      const transition = segments[i].transition;
      
      // Determine transition
      let transName = 'fade';
      let transDur = 0.1;
      if (transition && transition.type !== 'cut') {
        transName = TRANSITION_MAP[transition.type] || 'fade';
        transDur = Math.min(transition.duration || 0.15, currentDuration * 0.4, nextDuration * 0.4);
      }
      
      // Skip xfade for very short clips
      if (currentDuration < 0.2 || nextDuration < 0.2) {
        const concatPath = join(tmpDir, `concat_${i}.txt`);
        writeFileSync(concatPath, `file '${currentFile}'\nfile '${nextFile}'`);
        const mergedPath = join(tmpDir, `merged_${i}.mp4`);
        try {
          execSync(`ffmpeg -y -f concat -safe 0 -i "${concatPath}" -c copy "${mergedPath}"`, {
            stdio: 'pipe', timeout: 30000
          });
          currentFile = mergedPath;
          currentDuration += nextDuration;
        } catch (e) {
          console.warn(`  Concat failed at clip ${i}`);
        }
        continue;
      }
      
      // Apply xfade
      const offset = Math.max(0, currentDuration - transDur);
      const outPath = join(tmpDir, `merged_${i}.mp4`);
      
      try {
        execSync(`ffmpeg -y -i "${currentFile}" -i "${nextFile}" -filter_complex "[0:v][1:v]xfade=transition=${transName}:duration=${transDur.toFixed(3)}:offset=${offset.toFixed(3)}[v]" -map "[v]" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p "${outPath}"`, {
          stdio: 'pipe', timeout: 60000
        });
        currentFile = outPath;
        currentDuration = offset + nextDuration;
        transitionCount++;
        console.log(`  xfade clip ${i+1}: ${transName} (${transDur.toFixed(2)}s)`);
      } catch (e) {
        console.warn(`  xfade failed at clip ${i+1}, using concat`);
        const concatPath = join(tmpDir, `concat_${i}.txt`);
        writeFileSync(concatPath, `file '${currentFile}'\nfile '${nextFile}'`);
        try {
          execSync(`ffmpeg -y -f concat -safe 0 -i "${concatPath}" -c copy "${outPath}"`, {
            stdio: 'pipe', timeout: 30000
          });
          currentFile = outPath;
          currentDuration += nextDuration;
        } catch (e2) {
          console.warn(`  Fallback concat also failed`);
        }
      }
    }
    
    // Copy final output
    execSync(`cp "${currentFile}" "${OUTPUT_PATH}"`, { stdio: 'pipe' });
    console.log(`✓ Render complete: ${OUTPUT_PATH}`);
    console.log(`  Transitions: ${transitionCount}, Grade: ${grade}, Beats used: ${beats.length > 0}`);
  }
  
  // Stats
  const stats = statSync(OUTPUT_PATH);
  console.log(`\nOutput: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  
  // Cleanup
  try { rmSync(tmpDir, { recursive: true }); } catch {}
}

render();
