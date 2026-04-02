/**
 * In-memory singleton สำหรับ background update job
 * ใช้ร่วมกันระหว่าง API routes ใน Node.js process เดียวกัน
 * รองรับ parallel workers (หลาย bot token)
 */

export type JobStatus = "idle" | "running" | "done" | "cancelled";

export type JobError = { name: string; error: string };

export type JobState = {
  status: JobStatus;
  total: number;
  done: number;
  succeeded: number;
  failed: number;
  /** รายชื่อ entity ที่แต่ละ worker กำลังประมวลผลอยู่ (index = worker index) */
  workerNames: string[];
  workerCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  errors: JobError[];
};

const DEFAULT: JobState = {
  status: "idle",
  total: 0,
  done: 0,
  succeeded: 0,
  failed: 0,
  workerNames: [],
  workerCount: 1,
  startedAt: null,
  finishedAt: null,
  errors: [],
};

let state: JobState = { ...DEFAULT };
let cancelRequested = false;

export function getJobState(): JobState {
  return { ...state, workerNames: [...state.workerNames], errors: [...state.errors] };
}

export function isCancelRequested(): boolean {
  return cancelRequested;
}

/** เริ่มงานใหม่ — คืน false ถ้ากำลังทำงานอยู่แล้ว */
export function startJob(workerCount: number): boolean {
  if (state.status === "running") return false;
  cancelRequested = false;
  state = {
    ...DEFAULT,
    status: "running",
    workerCount,
    workerNames: Array(workerCount).fill(""),
    startedAt: new Date().toISOString(),
  };
  return true;
}

export function setJobTotal(total: number) {
  state.total = total;
}

/** อัปเดตชื่อ entity ที่ worker[index] กำลังประมวลผล */
export function setWorkerCurrent(workerIndex: number, name: string) {
  if (workerIndex < state.workerNames.length) {
    state.workerNames[workerIndex] = name;
  }
}

export function recordSuccess() {
  state.done++;
  state.succeeded++;
}

export function recordFailure(name: string, error: string) {
  state.done++;
  state.failed++;
  state.errors = [{ name, error }, ...state.errors].slice(0, 30);
}

export function finishJob() {
  state.status = cancelRequested ? "cancelled" : "done";
  state.finishedAt = new Date().toISOString();
  state.workerNames = [];
  cancelRequested = false;
}

export function cancelJob() {
  if (state.status === "running") cancelRequested = true;
}
