import { MonetEDL, EDLVersion } from "../server/types/edl.js";

export class EDLVersionStack {
  private stack: EDLVersion[] = [];
  private currentIndex: number = -1;

  constructor(initialEDL?: MonetEDL) {
    if (initialEDL) {
      this.push(initialEDL, "Initial Version");
    }
  }

  /**
   * Pushes a new EDL version onto the stack.
   * If there are future versions (after an undo), they are discarded.
   */
  push(edl: MonetEDL, label?: string): EDLVersion {
    const version: EDLVersion = {
      id: crypto.randomUUID(),
      edl: JSON.parse(JSON.stringify(edl)), // Deep copy to ensure immutability
      parentVersionId: this.currentIndex >= 0 ? this.stack[this.currentIndex].id : undefined,
      timestamp: Date.now(),
      label,
    };

    // Discard any "redo" versions
    if (this.currentIndex < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.currentIndex + 1);
    }

    this.stack.push(version);
    this.currentIndex = this.stack.length - 1;
    return version;
  }

  /**
   * Reverts to the previous version.
   */
  undo(): MonetEDL | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.stack[this.currentIndex].edl;
    }
    return null;
  }

  /**
   * Advances to the next version.
   */
  redo(): MonetEDL | null {
    if (this.currentIndex < this.stack.length - 1) {
      this.currentIndex++;
      return this.stack[this.currentIndex].edl;
    }
    return null;
  }

  /**
   * Jumps to a specific version by ID.
   */
  jumpToVersion(versionId: string): MonetEDL | null {
    const index = this.stack.findIndex((v) => v.id === versionId);
    if (index !== -1) {
      this.currentIndex = index;
      return this.stack[this.currentIndex].edl;
    }
    return null;
  }

  getCurrentVersion(): EDLVersion | null {
    return this.currentIndex >= 0 ? this.stack[this.currentIndex] : null;
  }

  getHistory(): EDLVersion[] {
    return [...this.stack];
  }
}
