// src/server/lib/__tests__/frame-precision-tools.test.ts
// Tests for LUT generator, ASS text generator, and subject mask utilities.

import { describe, it, expect } from "vitest";
import {
  generateASSFile,
  wordsToASS,
  generateWordHighlightASS,
  type ASSTextEntry,
} from "../ass-text-generator";

// ─── ASS Text Generator Tests ─────────────────────────────────────

describe("ASS Text Generator", () => {
  describe("generateASSFile", () => {
    it("should generate valid ASS file with header", () => {
      const entries: ASSTextEntry[] = [
        { text: "Hello World", startTime: 0, endTime: 2 },
      ];

      const result = generateASSFile(entries);

      expect(result).toContain("[Script Info]");
      expect(result).toContain("ScriptType: v4.00+");
      expect(result).toContain("PlayResX: 1920");
      expect(result).toContain("PlayResY: 1080");
      expect(result).toContain("[V4+ Styles]");
      expect(result).toContain("[Events]");
      expect(result).toContain("Dialogue:");
    });

    it("should format time correctly as H:MM:SS.cc", () => {
      const entries: ASSTextEntry[] = [
        { text: "Test", startTime: 65.5, endTime: 70.25 },
      ];

      const result = generateASSFile(entries);

      // 65.5s = 0:01:05.50
      expect(result).toContain("0:01:05.50");
      // 70.25s = 0:01:10.25
      expect(result).toContain("0:01:10.25");
    });

    it("should include position tags when x,y provided", () => {
      const entries: ASSTextEntry[] = [
        { text: "Centered", startTime: 0, endTime: 1, x: 0.5, y: 0.5 },
      ];

      const result = generateASSFile(entries);

      expect(result).toContain("{\\pos(960,540)}");
    });

    it("should include fade tags when fadeIn/fadeOut provided", () => {
      const entries: ASSTextEntry[] = [
        { text: "Fade In", startTime: 0, endTime: 1, fadeIn: 0.3, fadeOut: 0.5 },
      ];

      const result = generateASSFile(entries);

      expect(result).toContain("{\\fad(300,500)}");
    });

    it("should include move tags when moveTo provided", () => {
      const entries: ASSTextEntry[] = [
        {
          text: "Moving",
          startTime: 0,
          endTime: 2,
          x: 0.2,
          y: 0.5,
          moveTo: { x: 0.8, y: 0.5 },
        },
      ];

      const result = generateASSFile(entries);

      expect(result).toContain("{\\move(");
    });

    it("should include scale tags when scaleX/scaleY provided", () => {
      const entries: ASSTextEntry[] = [
        { text: "Scaled", startTime: 0, endTime: 1, scaleX: 150, scaleY: 80 },
      ];

      const result = generateASSFile(entries);

      expect(result).toContain("{\\fscx(150)}");
      expect(result).toContain("{\\fscy(80)}");
    });

    it("should include font size override", () => {
      const entries: ASSTextEntry[] = [
        { text: "Big Text", startTime: 0, endTime: 1, fontSize: 72 },
      ];

      const result = generateASSFile(entries);

      expect(result).toContain("{\\fs72}");
    });

    it("should convert hex color to ASS format", () => {
      const entries: ASSTextEntry[] = [
        { text: "Red Text", startTime: 0, endTime: 1, color: "#FF0000" },
      ];

      const result = generateASSFile(entries);

      // #FF0000 → &H000000FF (ASS is &HAABBGGRR)
      expect(result).toContain("{\\c&H000000FF}");
    });

    it("should use custom resolution", () => {
      const entries: ASSTextEntry[] = [
        { text: "Test", startTime: 0, endTime: 1 },
      ];

      const result = generateASSFile(entries, { width: 1280, height: 720 });

      expect(result).toContain("PlayResX: 1280");
      expect(result).toContain("PlayResY: 720");
    });

    it("should handle multiple entries", () => {
      const entries: ASSTextEntry[] = [
        { text: "First", startTime: 0, endTime: 1 },
        { text: "Second", startTime: 1, endTime: 2 },
        { text: "Third", startTime: 2, endTime: 3 },
      ];

      const result = generateASSFile(entries);
      const dialogueCount = (result.match(/Dialogue:/g) || []).length;

      expect(dialogueCount).toBe(3);
    });
  });

  describe("wordsToASS", () => {
    it("should convert word array to ASS format", () => {
      const words = [
        { word: "Hello", start: 0, end: 0.5 },
        { word: "World", start: 0.5, end: 1.0 },
      ];

      const result = wordsToASS(words);

      expect(result).toContain("[Script Info]");
      expect(result).toContain("[Events]");
      const dialogueCount = (result.match(/Dialogue:/g) || []).length;
      expect(dialogueCount).toBe(2);
    });
  });

  describe("generateWordHighlightASS", () => {
    it("should group words into lines", () => {
      const words = [
        { word: "This", start: 0, end: 0.3 },
        { word: "is", start: 0.3, end: 0.5 },
        { word: "a", start: 0.5, end: 0.6 },
        { word: "test", start: 0.6, end: 1.0 },
        { word: "of", start: 1.0, end: 1.2 },
        { word: "word", start: 1.2, end: 1.5 },
        { word: "highlighting.", start: 1.5, end: 2.0 },
      ];

      const result = generateWordHighlightASS(words);

      expect(result).toContain("[Script Info]");
      // Should group into reasonable chunks
      const dialogueCount = (result.match(/Dialogue:/g) || []).length;
      expect(dialogueCount).toBeGreaterThan(0);
      expect(dialogueCount).toBeLessThanOrEqual(7);
    });

    it("should include fade tags", () => {
      const words = [
        { word: "Fade", start: 0, end: 0.5 },
        { word: "Test", start: 0.5, end: 1.0 },
      ];

      const result = generateWordHighlightASS(words);

      expect(result).toContain("{\\fad(50,50)}");
    });
  });
});
