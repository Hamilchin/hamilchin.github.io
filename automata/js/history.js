// Undo and redo. Every entry is a complete copy of a document's state, so any
// action (painting, a rule change, a run) can be undone the same way. The
// oldest entries are dropped once the copies pass a memory budget.

export class History {
  constructor(budgetBytes = 96 * 2 ** 20) {
    this.budget = budgetBytes;
    this.past = [];
    this.future = [];
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  get last() {
    return this.past[this.past.length - 1];
  }

  push(entry) {
    entry.time = performance.now();
    this.past.push(entry);
    this.future.length = 0;
    this._trim();
  }

  /** Returns the entry to restore, remembering `current` for redo. */
  undo(current) {
    const e = this.past.pop();
    if (e) this.future.push(current);
    return e || null;
  }

  redo(current) {
    const e = this.future.pop();
    if (e) this.past.push(current);
    return e || null;
  }

  clear() {
    this.past.length = 0;
    this.future.length = 0;
  }

  _trim() {
    let bytes = 0;
    for (let i = this.past.length - 1; i >= 0; i--) {
      bytes += this.past[i].bytes || 0;
      if (bytes > this.budget && i < this.past.length - 1) {
        this.past.splice(0, i + 1);
        return;
      }
    }
  }
}
