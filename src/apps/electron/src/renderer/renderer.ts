type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export {};

declare global {
  interface Window {
    phys0: {
      listTools: () => Promise<JsonObject>;
      readResource: (uri: string) => Promise<JsonObject>;
      readUrdf: () => Promise<JsonObject>;
      callTool: (name: string, args?: JsonObject) => Promise<JsonObject>;
      createExperiment: (name: string, metadata?: JsonObject, worldId?: string) => Promise<JsonObject>;
      listExperiments: () => Promise<JsonObject>;
      listEvents: (experimentId: string) => Promise<JsonObject>;
      listArtifacts: (experimentId: string) => Promise<JsonObject>;
      sendAgentMessage: (input: JsonObject) => Promise<JsonObject>;
      openCalibrationWindow: () => Promise<JsonObject>;
      openRecordWindow: () => Promise<JsonObject>;
      openTrainWindow: () => Promise<JsonObject>;
      openReplayWindow: () => Promise<JsonObject>;
      openSettingsWindow: () => Promise<JsonObject>;
      openVirtualWorldWindow: (worldId: string) => Promise<JsonObject>;
      openWorkbenchWindow: (tab?: string) => Promise<JsonObject>;
      detachWorkbenchTab: (tab: string) => Promise<JsonObject>;
      onWorkbenchSetTab: (callback: (payload: { tab: string }) => void) => () => void;
      platform: string;
      getSettings: () => Promise<JsonObject>;
      setSetting: (key: string, value: unknown) => Promise<JsonObject>;
      onSettingsChanged: (callback: (settings: JsonObject) => void) => () => void;
      onAgentEvent: (callback: (event: JsonObject) => void) => () => void;
    };
  }
}

window.Phys0Shell.applyPlatformClass(window.phys0?.platform);

const output = document.querySelector<HTMLPreElement>("#output")!;
const experimentSelect = document.querySelector<HTMLSelectElement>("#experiment")!;
const experimentName = document.querySelector<HTMLInputElement>("#experiment-name")!;
const experimentsList = document.querySelector<HTMLUListElement>("#experiments-list")!;
const robotsList = document.querySelector<HTMLUListElement>("#robots-list")!;
const worldsList = document.querySelector<HTMLUListElement>("#worlds-list")!;
const assetsList = document.querySelector<HTMLUListElement>("#assets-list")!;
const artifactsList = document.querySelector<HTMLUListElement>("#artifacts-list")!;
const experimentMeta = document.querySelector<HTMLPreElement>("#experiment-meta")!;
const experimentNotes = document.querySelector<HTMLTextAreaElement>("#experiment-notes")!;
const defaultRobotInput = document.querySelector<HTMLInputElement>("#default-robot")!;
const worldSelect = document.querySelector<HTMLSelectElement>("#world-select")!;
const newWorldMenuBtn = document.querySelector<HTMLButtonElement>("#new-world-menu")!;
const newWorldOptions = document.querySelector<HTMLDivElement>("#new-world-options")!;
const worldModal = document.querySelector<HTMLDivElement>("#world-modal")!;
const worldModalTitle = document.querySelector<HTMLHeadingElement>("#world-modal-title")!;
const worldModalKind = document.querySelector<HTMLSpanElement>("#world-modal-kind")!;
const worldModalName = document.querySelector<HTMLInputElement>("#world-modal-name")!;
const worldModalNotes = document.querySelector<HTMLTextAreaElement>("#world-modal-notes")!;
const worldModalCancel = document.querySelector<HTMLButtonElement>("#world-modal-cancel")!;
const worldModalCreate = document.querySelector<HTMLButtonElement>("#world-modal-create")!;
const confirmModal = document.querySelector<HTMLDivElement>("#confirm-modal")!;
const confirmModalTitle = document.querySelector<HTMLHeadingElement>("#confirm-modal-title")!;
const confirmModalKind = document.querySelector<HTMLSpanElement>("#confirm-modal-kind")!;
const confirmModalMessage = document.querySelector<HTMLParagraphElement>("#confirm-modal-message")!;
const confirmModalCancel = document.querySelector<HTMLButtonElement>("#confirm-modal-cancel")!;
const confirmModalConfirm = document.querySelector<HTMLButtonElement>("#confirm-modal-confirm")!;
const refreshWorldsBtn = document.querySelector<HTMLButtonElement>("#refresh-worlds")!;
const refreshAssetsBtn = document.querySelector<HTMLButtonElement>("#refresh-assets")!;
const virtualArmNameInput = document.querySelector<HTMLInputElement>("#virtual-arm-name")!;
const createVirtualArmBtn = document.querySelector<HTMLButtonElement>("#create-virtual-arm")!;
const setDefaultRobot = document.querySelector<HTMLButtonElement>("#set-default-robot")!;
const refreshRobotsBtn = document.querySelector<HTMLButtonElement>("#refresh-robots")!;
const refreshArtifactsBtn = document.querySelector<HTMLButtonElement>("#refresh-artifacts")!;
const activeExperiment = document.querySelector<HTMLSpanElement>("#active-experiment")!;
const activeWorld = document.querySelector<HTMLSpanElement>("#active-world")!;
const experimentPickerButton = document.querySelector<HTMLButtonElement>("#experiment-picker-button")!;
const experimentPickerMenu = document.querySelector<HTMLDivElement>("#experiment-picker-menu")!;
const worldPickerButton = document.querySelector<HTMLButtonElement>("#world-picker-button")!;
const worldPickerMenu = document.querySelector<HTMLDivElement>("#world-picker-menu")!;
const chatLog = document.querySelector<HTMLDivElement>("#chat-log")!;
const chatInput = document.querySelector<HTMLTextAreaElement>("#chat-input")!;
const sendMessage = document.querySelector<HTMLButtonElement>("#send-message")!;
const recordAudio = document.querySelector<HTMLButtonElement>("#record-audio")!;
const metricGrid = document.querySelector<HTMLDivElement>("#metric-grid")!;
const processGraph = document.querySelector<HTMLDivElement>("#process-graph")!;
const metricsCatalog = document.querySelector<HTMLUListElement>("#metrics-catalog")!;
const metricLogsList = document.querySelector<HTMLUListElement>("#metric-logs")!;
const metricsGridHint = document.querySelector<HTMLSpanElement>("#metrics-grid-hint")!;
const metricsPaneHint = document.querySelector<HTMLSpanElement>("#metrics-pane-hint")!;
const statusText = document.querySelector<HTMLSpanElement>("#status-text")!;
const statusRecDot = document.querySelector<HTMLSpanElement>("#status-rec-dot")!;
const camerasStrip = document.querySelector<HTMLDivElement>(".cameras-strip")!;
const workspace = document.querySelector<HTMLDivElement>(".workspace")!;
const lhsSidebar = document.querySelector<HTMLElement>("#sidebar-lhs")!;
const rhsSidebar = document.querySelector<HTMLElement>("#sidebar-rhs")!;
const toggleLhsBtn = document.querySelector<HTMLButtonElement>("#toggle-lhs")!;
const toggleRhsBtn = document.querySelector<HTMLButtonElement>("#toggle-rhs")!;
const openSettingsBtn = document.querySelector<HTMLButtonElement>("#open-settings")!;
const camVideos: (HTMLVideoElement | null)[] = [
  document.querySelector<HTMLVideoElement>("#cam-0"),
  document.querySelector<HTMLVideoElement>("#cam-1"),
  document.querySelector<HTMLVideoElement>("#cam-2"),
];
const camStreams: (MediaStream | null)[] = [null, null, null];
let activeBrowserCameraIds = new Set<number>();
const virtualCameraCells = new Map<string, HTMLElement>();
const worldPreviewLastDraw = new Map<string, number>();
let physicalCameraWorldAssignments: Record<string, string> = JSON.parse(
  localStorage.getItem("phys0:physical-camera-worlds") ?? "{}"
) as Record<string, string>;

let experimentId = "";
let sessionId = "";
let defaultRobotId = "";
let selectedWorldId = "world_physical_default";
let assistantBubble: HTMLDivElement | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let experimentsCache: JsonObject[] = [];
let worldsCache: JsonObject[] = [];
let assignmentsCache: JsonObject[] = [];
let virtualEntitiesCache: JsonObject[] = [];
let physEntitiesCache: JsonObject[] = [];
let assetsCache: JsonObject[] = [];
let worldModalMode: "create" | "edit" = "create";
let worldModalType: "physical" | "virtual" = "physical";
let worldModalWorldId = "";
let confirmResolver: ((confirmed: boolean) => void) | null = null;


function closeConfirmModal(confirmed: boolean): void {
  confirmModal.hidden = true;
  const resolver = confirmResolver;
  confirmResolver = null;
  resolver?.(confirmed);
}

function confirmAction(options: { title: string; kind?: string; message: string; confirmLabel?: string }): Promise<boolean> {
  if (confirmResolver) closeConfirmModal(false);
  confirmModalTitle.textContent = options.title;
  confirmModalKind.textContent = options.kind ?? "";
  confirmModalMessage.textContent = options.message;
  confirmModalConfirm.textContent = options.confirmLabel ?? "Confirm";
  confirmModal.hidden = false;
  confirmModalConfirm.focus();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

confirmModalCancel.addEventListener("click", () => closeConfirmModal(false));
confirmModalConfirm.addEventListener("click", () => closeConfirmModal(true));
confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) closeConfirmModal(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmModal.hidden) closeConfirmModal(false);
});

function setActiveExperimentLabel(text: string, active: boolean): void {
  activeExperiment.textContent = text;
  experimentPickerButton.classList.toggle("active", active);
}

function setActiveWorldLabel(): void {
  const world = selectedWorld();
  const name = String(world?.name ?? selectedWorldId);
  const type = String(world?.type ?? "world");
  activeWorld.textContent = `${name} · ${type}`;
  worldPickerButton.classList.toggle("active", Boolean(world));
  document.body.dataset.worldId = selectedWorldId;
  document.body.dataset.worldType = type;
  window.dispatchEvent(new CustomEvent("phys0:world-selected", { detail: { worldId: selectedWorldId, worldType: type } }));
}

function show(value: unknown): void {
  output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function withExperiment(args: JsonObject = {}): JsonObject {
  const next: JsonObject = { ...args };
  if (experimentId) next.experiment_id = experimentId;
  if (defaultRobotId && !next.robot_id) next.robot_id = defaultRobotId;
  return next;
}

function setActive(experiment: JsonObject, session?: JsonObject): void {
  experimentId = String(experiment.id ?? "");
  sessionId = String(session?.id ?? sessionId);
  selectedWorldId = String(experiment.world_id ?? selectedWorldId);
  worldSelect.value = selectedWorldId;
  syncSelectedWorldState();
  setActiveExperimentLabel(
    experimentId ? String(experiment.name ?? "Experiment") : "No experiment",
    Boolean(experimentId)
  );
  updateExperimentsListSelection();
  renderPickerMenus();
  updateNotesPane();
  updateStatusbar();
}

function appendChat(role: string, text: string): HTMLDivElement {
  const item = document.createElement("div");
  item.className = `chat-item ${role}`;
  const label = document.createElement("div");
  label.className = "chat-role";
  label.textContent = role;
  const body = document.createElement("div");
  body.className = "chat-body";
  body.textContent = text;
  item.append(label, body);
  chatLog.append(item);
  chatLog.scrollTop = chatLog.scrollHeight;
  return body;
}

function imagesFromContent(content: unknown): Array<{ data: string; mimeType: string }> {
  if (!Array.isArray(content)) return [];
  const images: Array<{ data: string; mimeType: string }> = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const c = item as JsonObject;
    if (c.type === "image" && typeof c.data === "string" && typeof c.mimeType === "string") {
      images.push({ data: c.data, mimeType: c.mimeType });
    }
  }
  return images;
}

function appendToolBubble(name: string, result: JsonObject | undefined): void {
  const body = appendChat("tool", `${name} response`);
  if (!result) return;
  for (const img of imagesFromContent(result.content)) {
    const el = document.createElement("img");
    el.src = `data:${img.mimeType};base64,${img.data}`;
    el.className = "tool-image";
    body.parentElement?.appendChild(el);
  }
}

/* ------------------------------ metrics ------------------------------ */
// An experiment produces low-level sensor streams (continuous, plottable) and
// high-level metric logs (discrete events). Streams live in `metrics` and are
// charted; logs live in `metricLogs`. The main area shows a grid of pinned
// stream charts; the right-hand Metrics pane is the catalog that pins them.

type MetricSample = { value: number; timestamp: number };
type MetricLogEntry = { name: string; message: string; level: string; timestamp: number };
type MetricDef = { unit?: string; min?: number | null; max?: number | null };

type StreamMetric = {
  name: string;
  unit: string;
  min: number | null;
  max: number | null;
  samples: MetricSample[];
};

const MAX_METRIC_SAMPLES = 600;
const MAX_METRIC_LOGS = 200;
const metrics = new Map<string, StreamMetric>();
const metricLogs: MetricLogEntry[] = [];

let pinnedMetrics: Set<string>;
try {
  const stored = localStorage.getItem("phys0:pinned-metrics");
  const parsed = stored ? (JSON.parse(stored) as unknown) : null;
  pinnedMetrics = new Set(Array.isArray(parsed) ? parsed.map(String) : ["pH"]);
} catch {
  pinnedMetrics = new Set(["pH"]);
}

function savePinnedMetrics(): void {
  try {
    localStorage.setItem("phys0:pinned-metrics", JSON.stringify([...pinnedMetrics]));
  } catch { /* ignore */ }
}

function registerMetric(name: string, def: MetricDef = {}): StreamMetric {
  let metric = metrics.get(name);
  if (!metric) {
    metric = { name, unit: def.unit ?? "", min: def.min ?? null, max: def.max ?? null, samples: [] };
    metrics.set(name, metric);
  } else {
    if (def.unit) metric.unit = def.unit;
    if (def.min !== undefined) metric.min = def.min;
    if (def.max !== undefined) metric.max = def.max;
  }
  return metric;
}

// Returns true when a brand-new metric name was introduced (a structural change
// that needs the grid/catalog rebuilt rather than just redrawn).
function ingestSample(name: string, value: number, timestamp: number, def: MetricDef = {}): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(timestamp)) return false;
  const isNew = !metrics.has(name);
  const metric = registerMetric(name, def);
  metric.samples.push({ value, timestamp });
  if (metric.samples.length > MAX_METRIC_SAMPLES) {
    metric.samples.splice(0, metric.samples.length - MAX_METRIC_SAMPLES);
  }
  return isNew;
}

function ingestLog(entry: MetricLogEntry): void {
  metricLogs.push(entry);
  if (metricLogs.length > MAX_METRIC_LOGS) {
    metricLogs.splice(0, metricLogs.length - MAX_METRIC_LOGS);
  }
}

// Generic event shapes from the backend / agent stream. `ph_sample` is the one
// live source today; `metric_sample` / `metric_log` are handled so any future
// backend metric flows straight through without renderer changes.
function ingestMetricSampleEvent(content: JsonObject): boolean {
  const name = String(content.name ?? "").trim();
  if (!name) return false;
  const def: MetricDef = {};
  if (typeof content.unit === "string") def.unit = content.unit;
  if (typeof content.min === "number") def.min = content.min;
  if (typeof content.max === "number") def.max = content.max;
  return ingestSample(name, Number(content.value), Number(content.timestamp ?? Date.now()), def);
}

function ingestMetricLogEvent(content: JsonObject): void {
  const message = String(content.message ?? content.text ?? "").trim();
  if (!message) return;
  ingestLog({
    name: String(content.name ?? content.metric ?? "log"),
    message,
    level: String(content.level ?? "info"),
    timestamp: Number(content.timestamp) || Date.now()
  });
}

// Clears samples/logs on an experiment switch but keeps metric definitions, so
// pH stays registered (its catalog row and 0–14 axis survive a reload).
function resetMetricData(): void {
  for (const metric of metrics.values()) metric.samples.length = 0;
  metricLogs.length = 0;
}

function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function formatMetricValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

function latestSample(metric: StreamMetric): MetricSample | null {
  return metric.samples.length ? metric.samples[metric.samples.length - 1] : null;
}

function latestMetricText(metric: StreamMetric): string {
  const sample = latestSample(metric);
  if (!sample) return "—";
  const value = formatMetricValue(sample.value);
  return metric.unit ? `${value} ${metric.unit}` : value;
}

function metricBounds(metric: StreamMetric): { lo: number; hi: number } {
  if (metric.min !== null && metric.max !== null) return { lo: metric.min, hi: metric.max };
  if (metric.samples.length === 0) return { lo: metric.min ?? 0, hi: metric.max ?? 1 };
  let lo = Infinity;
  let hi = -Infinity;
  for (const sample of metric.samples) {
    if (sample.value < lo) lo = sample.value;
    if (sample.value > hi) hi = sample.value;
  }
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  return { lo: metric.min ?? lo - pad, hi: metric.max ?? hi + pad };
}

function prepareCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  return { ctx, w: rect.width, h: rect.height };
}

function drawMetricChart(canvas: HTMLCanvasElement, metric: StreamMetric): void {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;
  const { ctx, w, h } = prepared;
  ctx.clearRect(0, 0, w, h);

  const padLeft = 40;
  const padBottom = 16;
  const padTop = 10;
  const padRight = 12;
  const innerW = Math.max(1, w - padLeft - padRight);
  const innerH = Math.max(1, h - padTop - padBottom);

  const gridColor = themeColor("--border-1", "#e4e4e7");
  const axisColor = themeColor("--border-2", "#d4d4d8");
  const labelColor = themeColor("--text-4", "#a1a1aa");
  const lineColor = themeColor("--accent", "#c08a0b");

  const { lo, hi } = metricBounds(metric);
  const span = Math.max(1e-9, hi - lo);

  ctx.font = "10px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";

  for (const frac of [0, 0.5, 1]) {
    const y = padTop + innerH - frac * innerH;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + innerW, y);
    ctx.stroke();
    ctx.fillStyle = labelColor;
    ctx.fillText(formatMetricValue(lo + frac * span), padLeft - 6, y);
  }

  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, padTop + innerH);
  ctx.lineTo(padLeft + innerW, padTop + innerH);
  ctx.stroke();

  if (metric.samples.length === 0) {
    ctx.fillStyle = labelColor;
    ctx.textAlign = "center";
    ctx.fillText("waiting for samples…", padLeft + innerW / 2, padTop + innerH / 2);
    return;
  }

  const tMin = metric.samples[0].timestamp;
  const tMax = metric.samples[metric.samples.length - 1].timestamp;
  const tSpan = Math.max(1, tMax - tMin);
  const xFor = (t: number): number =>
    metric.samples.length === 1 ? padLeft + innerW / 2 : padLeft + ((t - tMin) / tSpan) * innerW;
  const yFor = (v: number): number =>
    padTop + innerH - Math.max(0, Math.min(1, (v - lo) / span)) * innerH;

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  metric.samples.forEach((sample, index) => {
    const x = xFor(sample.timestamp);
    const y = yFor(sample.value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  if (metric.samples.length <= 80) {
    ctx.fillStyle = lineColor;
    for (const sample of metric.samples) {
      ctx.beginPath();
      ctx.arc(xFor(sample.timestamp), yFor(sample.value), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawSparkline(canvas: HTMLCanvasElement, metric: StreamMetric): void {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;
  const { ctx, w, h } = prepared;
  ctx.clearRect(0, 0, w, h);
  if (metric.samples.length === 0) return;
  const { lo, hi } = metricBounds(metric);
  const span = Math.max(1e-9, hi - lo);
  const tMin = metric.samples[0].timestamp;
  const tSpan = Math.max(1, metric.samples[metric.samples.length - 1].timestamp - tMin);
  const pad = 2;
  ctx.strokeStyle = themeColor("--accent", "#c08a0b");
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  metric.samples.forEach((sample, index) => {
    const x = metric.samples.length === 1
      ? w / 2
      : pad + ((sample.timestamp - tMin) / tSpan) * (w - 2 * pad);
    const y = pad + (h - 2 * pad) - Math.max(0, Math.min(1, (sample.value - lo) / span)) * (h - 2 * pad);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

const METRIC_PIN_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
  '<path d="M6 2.2h4l-.7 1.3.8 3.2 1.9 1.8v1.1H4V8.5l1.9-1.8.8-3.2z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>' +
  '<line x1="8" y1="10.4" x2="8" y2="13.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';

function renderMetricGrid(): void {
  metricGrid.replaceChildren();
  const pinned = [...pinnedMetrics].filter((name) => metrics.has(name));
  metricsGridHint.textContent = pinned.length ? `${pinned.length} pinned` : "graph grid";
  if (pinned.length === 0) {
    const empty = document.createElement("div");
    empty.className = "metric-grid-empty";
    empty.textContent = "No metrics pinned. Pin a metric in the Metrics panel to chart it here.";
    metricGrid.append(empty);
    return;
  }
  for (const name of pinned) {
    const card = document.createElement("div");
    card.className = "metric-card";
    card.dataset.metric = name;
    const head = document.createElement("div");
    head.className = "metric-card-head";
    const nameEl = document.createElement("span");
    nameEl.className = "metric-card-name";
    nameEl.textContent = name;
    const valueEl = document.createElement("span");
    valueEl.className = "metric-card-value";
    const unpin = document.createElement("button");
    unpin.className = "metric-unpin";
    unpin.title = "Unpin from graph grid";
    unpin.setAttribute("aria-label", `Unpin ${name}`);
    unpin.innerHTML = iconSvg("x");
    unpin.addEventListener("click", () => toggleMetricPin(name));
    head.append(nameEl, valueEl, unpin);
    const graph = document.createElement("div");
    graph.className = "metric-card-graph";
    graph.append(document.createElement("canvas"));
    card.append(head, graph);
    metricGrid.append(card);
  }
}

function redrawMetricGrid(): void {
  for (const card of metricGrid.querySelectorAll<HTMLElement>(".metric-card")) {
    const metric = metrics.get(card.dataset.metric ?? "");
    if (!metric) continue;
    const canvas = card.querySelector("canvas");
    if (canvas) drawMetricChart(canvas, metric);
    const valueEl = card.querySelector<HTMLElement>(".metric-card-value");
    if (valueEl) valueEl.textContent = latestMetricText(metric);
  }
}

function renderMetricCatalog(): void {
  metricsCatalog.replaceChildren();
  const names = [...metrics.keys()].sort((a, b) => a.localeCompare(b));
  metricsPaneHint.textContent = names.length ? `${names.length} tracked` : "";
  if (names.length === 0) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "No metrics yet. They appear here as the experiment logs sensor and metric data.";
    metricsCatalog.append(empty);
    return;
  }
  for (const name of names) {
    const metric = metrics.get(name)!;
    const pinned = pinnedMetrics.has(name);
    const li = document.createElement("li");
    li.className = "metric-row";
    li.dataset.metric = name;
    const pin = document.createElement("button");
    pin.className = "metric-pin";
    pin.classList.toggle("pinned", pinned);
    pin.setAttribute("aria-pressed", String(pinned));
    pin.title = pinned ? "Unpin from graph grid" : "Pin to graph grid";
    pin.innerHTML = METRIC_PIN_SVG;
    pin.addEventListener("click", () => toggleMetricPin(name));
    const main = document.createElement("div");
    main.className = "metric-row-main";
    const nameEl = document.createElement("div");
    nameEl.className = "metric-row-name";
    nameEl.textContent = metric.unit ? `${name} (${metric.unit})` : name;
    const spark = document.createElement("canvas");
    spark.className = "metric-spark";
    main.append(nameEl, spark);
    const valueEl = document.createElement("div");
    valueEl.className = "metric-row-value";
    li.append(pin, main, valueEl);
    metricsCatalog.append(li);
  }
}

function redrawMetricCatalog(): void {
  for (const row of metricsCatalog.querySelectorAll<HTMLElement>(".metric-row")) {
    const metric = metrics.get(row.dataset.metric ?? "");
    if (!metric) continue;
    const spark = row.querySelector<HTMLCanvasElement>("canvas.metric-spark");
    if (spark) drawSparkline(spark, metric);
    const valueEl = row.querySelector<HTMLElement>(".metric-row-value");
    if (valueEl) valueEl.textContent = latestMetricText(metric);
  }
}

function renderMetricLogs(): void {
  metricLogsList.replaceChildren();
  if (metricLogs.length === 0) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "No metric log entries yet.";
    metricLogsList.append(empty);
    return;
  }
  for (let i = metricLogs.length - 1; i >= 0; i--) {
    const entry = metricLogs[i];
    const li = document.createElement("li");
    li.className = "metric-log-row";
    const level = entry.level.toLowerCase();
    if (level === "error" || level === "warn") li.classList.add(`level-${level}`);
    const time = document.createElement("span");
    time.className = "metric-log-time";
    time.textContent = new Date(entry.timestamp).toLocaleTimeString([], { hour12: false });
    const nameEl = document.createElement("span");
    nameEl.className = "metric-log-name";
    nameEl.textContent = entry.name;
    const msg = document.createElement("span");
    msg.className = "metric-log-msg";
    msg.textContent = entry.message;
    li.append(time, nameEl, msg);
    metricLogsList.append(li);
  }
}

function updateStatusbar(): void {
  const experiment = experimentId
    ? experimentsCache.find((item) => String(item.id) === experimentId)
    : undefined;
  const experimentLabel = experiment ? String(experiment.name ?? "experiment") : "no experiment";
  const world = selectedWorld();
  const worldLabel = String(world?.name ?? selectedWorldId);
  const armLabel = defaultRobotId || "none";
  const count = metrics.size;
  statusText.textContent =
    `${experimentLabel} · ${worldLabel} · arm ${armLabel} · ${count} metric${count === 1 ? "" : "s"}`;
}

let metricFrameQueued = false;
let metricStructureDirty = false;

// Coalesces redraws into one animation frame. `structural` rebuilds the grid
// and catalog DOM (pin changes, new metric names); otherwise canvases are just
// redrawn in place against fresh data or a resized layout.
function scheduleMetricRender(structural = false): void {
  if (structural) metricStructureDirty = true;
  if (metricFrameQueued) return;
  metricFrameQueued = true;
  requestAnimationFrame(() => {
    metricFrameQueued = false;
    if (metricStructureDirty) {
      metricStructureDirty = false;
      renderMetricGrid();
      renderMetricCatalog();
      renderMetricLogs();
    }
    redrawMetricGrid();
    redrawMetricCatalog();
    updateStatusbar();
  });
}

function toggleMetricPin(name: string): void {
  if (pinnedMetrics.has(name)) pinnedMetrics.delete(name);
  else pinnedMetrics.add(name);
  savePinnedMetrics();
  scheduleMetricRender(true);
}

function renderEvents(events: JsonObject[]): void {
  chatLog.replaceChildren();
  resetMetricData();
  for (const event of events) {
    const type = String(event.type ?? "");
    const role = String(event.role ?? "system");
    const content = (event.content ?? {}) as JsonObject;
    if (type === "message" && role !== "system") appendChat(role, String(content.text ?? ""));
    if (type === "tool_call") appendChat("tool", `${String(event.name ?? "tool")} ${JSON.stringify(content)}`);
    if (type === "tool_response") appendToolBubble(String(event.name ?? "tool"), content);
    if (type === "error") appendChat("error", String(content.message ?? content.text ?? ""));
    if (type === "ph_sample") {
      ingestSample("pH", Number(content.value), Number(content.timestamp), { min: 0, max: 14 });
    }
    if (type === "metric_sample") ingestMetricSampleEvent(content);
    if (type === "metric_log") ingestMetricLogEvent(content);
  }
  scheduleMetricRender(true);
}

function closeAppbarMenus(): void {
  experimentPickerMenu.hidden = true;
  worldPickerMenu.hidden = true;
  experimentPickerButton.setAttribute("aria-expanded", "false");
  worldPickerButton.setAttribute("aria-expanded", "false");
  for (const p of document.querySelectorAll<HTMLElement>(".appbar-submenu-popup.open")) p.classList.remove("open");
}

function menuButton(label: string, sub: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "appbar-menu-item";
  button.classList.toggle("active", active);
  const title = document.createElement("span");
  title.className = "appbar-menu-title";
  title.textContent = label;
  const meta = document.createElement("span");
  meta.className = "appbar-menu-meta";
  meta.textContent = sub;
  button.append(title, meta);
  button.addEventListener("click", () => {
    closeAppbarMenus();
    onClick();
  });
  return button;
}

function renderPickerMenus(): void {
  experimentPickerMenu.replaceChildren();
  for (const experiment of experimentsCache) {
    const id = String(experiment.id ?? "");
    const world = worldsCache.find((item) => String(item.id) === String(experiment.world_id ?? ""));
    experimentPickerMenu.append(menuButton(
      String(experiment.name ?? "Untitled"),
      String(world?.name ?? experiment.world_id ?? id),
      id === experimentId,
      () => void selectExperiment(id)
    ));
  }
  if (experimentsCache.length > 0) {
    const divider = document.createElement("div");
    divider.className = "appbar-menu-divider";
    experimentPickerMenu.append(divider);
  }
  experimentPickerMenu.append(menuButton("+ New Experiment", "create in current world", false, () => void createExperimentFromCurrentWorld()));

  worldPickerMenu.replaceChildren();
  for (const p of document.querySelectorAll(".appbar-submenu-popup.detached")) p.remove();
  for (const world of worldsCache) {
    const id = String(world.id ?? "");
    const experimentCount = experimentsCache.filter((experiment) => String(experiment.world_id ?? "") === id).length;
    worldPickerMenu.append(menuButton(
      String(world.name ?? id),
      `${String(world.type ?? "world")} · ${experimentCount} experiment${experimentCount === 1 ? "" : "s"}`,
      id === selectedWorldId,
      () => void selectWorld(id, { matchExperiment: true })
    ));
  }
  if (worldsCache.length > 0) {
    const divider = document.createElement("div");
    divider.className = "appbar-menu-divider";
    worldPickerMenu.append(divider);
  }
  const newWorld = document.createElement("div");
  newWorld.className = "appbar-submenu";
  newWorld.tabIndex = 0;
  const label = document.createElement("div");
  label.className = "appbar-submenu-label";
  const labelText = document.createElement("span");
  labelText.textContent = "+ New World";
  const chevron = document.createElement("span");
  chevron.className = "appbar-submenu-chevron";
  chevron.textContent = "›";
  label.append(labelText, chevron);
  const popup = document.createElement("div");
  popup.className = "appbar-submenu-popup";
  popup.append(
    menuButton("Physical World", "hardware bench", false, () => openWorldModal("create", "physical")),
    menuButton("Virtual: Empty", "blank simulation", false, () => openWorldModal("create", "virtual", undefined, "empty")),
    menuButton("Virtual: Bench setup", "arm · bench · tray", false, () => openWorldModal("create", "virtual", undefined, "bench")),
    menuButton("Virtual: Glassware kit", "rack · vials · beaker · pipette", false, () => openWorldModal("create", "virtual", undefined, "glassware")),
    menuButton("Virtual: Titration station", "ring stand · burette · flask · pH meter", false, () => openWorldModal("create", "virtual", undefined, "titration")),
    menuButton("Virtual: Weighing station", "balance · reagent · weigh boat · spatula", false, () => openWorldModal("create", "virtual", undefined, "weighing"))
  );
  newWorld.append(label);
  worldPickerMenu.append(newWorld);
  popup.classList.add("detached");
  document.body.append(popup);
  const positionPopup = (): void => {
    const rect = label.getBoundingClientRect();
    const popupWidth = 260;
    const gap = 4;
    let left = rect.right + gap;
    if (left + popupWidth > window.innerWidth - 8) left = Math.max(8, rect.left - popupWidth - gap);
    popup.style.left = `${left}px`;
    popup.style.top = `${rect.top}px`;
  };
  const openSubmenu = (): void => {
    positionPopup();
    popup.classList.add("open");
  };
  const closeSubmenu = (): void => popup.classList.remove("open");
  newWorld.addEventListener("mouseenter", openSubmenu);
  newWorld.addEventListener("mouseleave", (e) => {
    if (!popup.contains(e.relatedTarget as Node | null)) closeSubmenu();
  });
  newWorld.addEventListener("click", openSubmenu);
  popup.addEventListener("mouseleave", (e) => {
    if (!newWorld.contains(e.relatedTarget as Node | null)) closeSubmenu();
  });
  worldPickerMenu.addEventListener("scroll", () => { if (popup.classList.contains("open")) positionPopup(); });
  setActiveWorldLabel();
}

function renderExperimentsList(): void {
  experimentsList.replaceChildren();
  if (experimentsCache.length === 0) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "No experiments yet. Create one above.";
    experimentsList.append(empty);
    return;
  }
  for (const experiment of experimentsCache) {
    const id = String(experiment.id);
    const li = document.createElement("li");
    li.className = "list-item";
    li.dataset.experimentId = id;
    if (id === experimentId) li.classList.add("active");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = String(experiment.name ?? "Untitled");
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = id;
    li.append(title, sub);
    li.addEventListener("click", () => {
      if (id === experimentId) return;
      void selectExperiment(id);
    });
    experimentsList.append(li);
  }
}

function selectedWorld(): JsonObject | undefined {
  return worldsCache.find((world) => String(world.id) === selectedWorldId);
}

function syncSelectedWorldState(): void {
  const world = selectedWorld();
  defaultRobotId = typeof world?.default_robot_id === "string" ? world.default_robot_id : "";
  defaultRobotInput.value = defaultRobotId;
  worldSelect.value = selectedWorldId;
  const isVirtual = world?.type === "virtual";
  createVirtualArmBtn.disabled = !isVirtual;
  setActiveWorldLabel();
  updateCameraVisibility(activeBrowserCameraIds);
  for (const li of worldsList.querySelectorAll<HTMLLIElement>(".world-card")) {
    li.classList.toggle("active", li.dataset.worldId === selectedWorldId);
  }
  updateStatusbar();
}

function worldEntities(worldId: string): JsonObject[] {
  return virtualEntitiesCache.filter((entity) => String(entity.world_id) === worldId);
}

function savePhysicalCameraAssignments(): void {
  localStorage.setItem("phys0:physical-camera-worlds", JSON.stringify(physicalCameraWorldAssignments));
}

function worldType(worldId: string): string {
  return String(worldsCache.find((world) => String(world.id) === worldId)?.type ?? "");
}

function assignCameraToWorld(input: { cameraId: string; cameraKind: "physical" | "virtual"; worldId: string }): void {
  const targetType = worldType(input.worldId);
  if (input.cameraKind === "virtual") {
    const entity = virtualEntitiesCache.find((item) => String(item.id) === input.cameraId && item.kind === "camera");
    if (!entity) throw new Error(`Unknown virtual camera: ${input.cameraId}`);
    if (String(entity.world_id) !== input.worldId) throw new Error("Virtual cameras stay in the virtual world they were created in.");
    if (targetType !== "virtual") throw new Error("Virtual cameras can only appear in virtual worlds.");
    return;
  }
  if (targetType !== "physical") throw new Error("Physical cameras can only be assigned to physical worlds.");
  physicalCameraWorldAssignments[input.cameraId] = input.worldId;
  savePhysicalCameraAssignments();
}

function physicalCameraWorldId(slot: number): string {
  const id = String(slot);
  const assigned = physicalCameraWorldAssignments[id];
  if (assigned && worldType(assigned) === "physical") return assigned;
  assignCameraToWorld({ cameraId: id, cameraKind: "physical", worldId: "world_physical_default" });
  return "world_physical_default";
}

function iconSvg(name: "check" | "config" | "edit" | "plus" | "trash" | "x"): string {
  if (name === "check") return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 8.2l3 3L13 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (name === "config") return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 2l.6 1.5 1.6-.3.4 1.5 1.5.7-.9 1.3.9 1.3-1.5.7-.4 1.5-1.6-.3L8 14l-.6-1.5-1.6.3-.4-1.5-1.5-.7.9-1.3-.9-1.3 1.5-.7.4-1.5 1.6.3z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>`;
  if (name === "edit") return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 11.8V14h2.2L12.5 6.7l-2.2-2.2L3 11.8zM9.7 5.1l2.2 2.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (name === "plus") return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  if (name === "trash") return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 4h10M6 4V2.8h4V4M5 6v7M8 6v7M11 6v7M4.5 4l.5 10h6l.5-10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

function makeGhostIcon(name: "check" | "config" | "edit" | "plus" | "trash" | "x", label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "ghost-icon";
  button.innerHTML = iconSvg(name);
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}

function drawFallbackPlanet(ctx: CanvasRenderingContext2D, size: number, label: string, hue: number): void {
  const gradient = ctx.createRadialGradient(size * 0.32, size * 0.28, 4, size * 0.5, size * 0.5, size * 0.72);
  gradient.addColorStop(0, `hsl(${hue}, 68%, 52%)`);
  gradient.addColorStop(0.55, `hsl(${(hue + 48) % 360}, 52%, 30%)`);
  gradient.addColorStop(1, "#050505");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "500 10px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label.slice(0, 18), size / 2, size / 2);
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): boolean {
  const maybeVideo = source as HTMLVideoElement;
  const maybeCanvas = source as HTMLCanvasElement;
  const sourceW = maybeVideo.videoWidth || maybeCanvas.width || 0;
  const sourceH = maybeVideo.videoHeight || maybeCanvas.height || 0;
  if (sourceW <= 0 || sourceH <= 0) return false;
  const scale = Math.max(dw / sourceW, dh / sourceH);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = Math.max(0, (sourceW - sw) / 2);
  const sy = Math.max(0, (sourceH - sh) / 2);
  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
  return true;
}

function drawWorldPreviewCanvas(canvas: HTMLCanvasElement, world: JsonObject): void {
  const size = 320;
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const worldId = String(world.id ?? "");
  const isVirtual = world.type === "virtual";
  const virtualCameras = worldEntities(worldId).filter((entity) => entity.kind === "camera");
  const physicalVideos = camVideos
    .map((video, index) => ({ video, index }))
    .filter((item) =>
      item.video &&
      activeBrowserCameraIds.has(item.index) &&
      item.video.readyState >= 2 &&
      physicalCameraWorldId(item.index) === worldId
    );
  const tiles = isVirtual ? virtualCameras : physicalVideos;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, size, size);
  if (tiles.length === 0) {
    const hue = Array.from(worldId).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
    drawFallbackPlanet(ctx, size, isVirtual ? "no virtual cameras" : "no camera feed", hue);
  } else {
    const cols = Math.ceil(Math.sqrt(tiles.length));
    const rows = Math.ceil(tiles.length / cols);
    const tileW = size / cols;
    const tileH = size / rows;
    tiles.forEach((tile, index) => {
      const x = (index % cols) * tileW;
      const y = Math.floor(index / cols) * tileH;
      if (isVirtual) {
        const entity = tile as JsonObject;
        const streamCanvas =
          worldsList.ownerDocument.querySelector<HTMLCanvasElement>(`.virtual-camera-stream[data-camera-id="${String(entity.id)}"]`) ??
          worldsList.ownerDocument.querySelector<HTMLCanvasElement>(`.virtual-camera-preview[data-camera-id="${String(entity.id)}"]`);
        const drewStream = streamCanvas ? drawImageCover(ctx, streamCanvas, x, y, tileW, tileH) : false;
        if (!drewStream) {
          const hue = Array.from(String(entity.id ?? index)).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
          const gradient = ctx.createLinearGradient(x, y, x + tileW, y + tileH);
          gradient.addColorStop(0, `hsl(${hue}, 62%, 44%)`);
          gradient.addColorStop(1, `hsl(${(hue + 92) % 360}, 54%, 18%)`);
          ctx.fillStyle = gradient;
          ctx.fillRect(x, y, tileW, tileH);
          ctx.fillStyle = "rgba(255,255,255,0.76)";
          ctx.font = "500 10px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(entity.name ?? "camera").slice(0, 16), x + tileW / 2, y + tileH / 2);
        }
      } else {
        const video = (tile as { video: HTMLVideoElement | null }).video;
        if (video) drawImageCover(ctx, video, x, y, tileW, tileH);
      }
    });
  }
  ctx.restore();
  ctx.strokeStyle = worldId === selectedWorldId ? "#f5d76e" : "#2a2a2a";
  ctx.lineWidth = worldId === selectedWorldId ? 5 : 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.stroke();
}

function updateWorldPreviewCanvases(): void {
  const now = performance.now();
  for (const canvas of worldsList.querySelectorAll<HTMLCanvasElement>(".world-orb-canvas")) {
    const worldId = canvas.dataset.worldId ?? "";
    const world = worldsCache.find((item) => String(item.id) === worldId);
    if (!world) continue;
    const intervalMs = worldId === selectedWorldId ? 50 : 1000;
    const last = worldPreviewLastDraw.get(worldId) ?? 0;
    if (now - last < intervalMs) continue;
    worldPreviewLastDraw.set(worldId, now);
    drawWorldPreviewCanvas(canvas, world);
  }
}

function renderWorldsList(): void {
  worldsList.replaceChildren();
  worldSelect.replaceChildren();
  if (worldsCache.length === 0) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "No worlds found.";
    worldsList.append(empty);
    return;
  }
  for (const world of worldsCache) {
    const id = String(world.id);
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${String(world.name ?? id)} · ${String(world.type ?? "world")}`;
    worldSelect.append(option);

    const li = document.createElement("li");
    li.className = "world-card";
    li.dataset.worldId = id;
    if (id === selectedWorldId) li.classList.add("active");
    const orb = document.createElement("button");
    orb.type = "button";
    orb.className = "world-orb";
    orb.setAttribute("aria-label", `Select ${String(world.name ?? id)}`);
    const canvas = document.createElement("canvas");
    canvas.className = "world-orb-canvas";
    canvas.dataset.worldId = id;
    orb.append(canvas);
    if (world.type === "virtual") {
      const configText = document.createElement("span");
      configText.className = "world-orb-config";
      configText.textContent = "Configure";
      configText.addEventListener("click", async (event) => {
        event.stopPropagation();
        show(await window.phys0.openVirtualWorldWindow(id));
      });
      orb.append(configText);
    }
    orb.addEventListener("click", () => {
      void selectWorld(id, { matchExperiment: true });
    });

    const labelRow = document.createElement("div");
    labelRow.className = "world-label-row";
    const title = document.createElement("div");
    title.className = "world-label-title";
    title.textContent = String(world.name ?? id);
    const titleActions = document.createElement("div");
    titleActions.className = "row-icon-actions";
    const edit = makeGhostIcon("edit", "Rename world");
    edit.addEventListener("click", (event) => {
      event.stopPropagation();
      startWorldInlineEdit(labelRow, title, world);
    });
    titleActions.append(edit);
    const del = makeGhostIcon("trash", "Delete world");
    del.disabled = id === "world_physical_default";
    del.addEventListener("click", async (event) => {
      event.stopPropagation();
      const worldName = String(world.name ?? id);
      if (del.disabled) return;
      const confirmed = await confirmAction({
        title: `Delete ${worldName}`,
        kind: String(world.type ?? "world"),
        message: `Delete ${worldName}? This removes the world and its local assignments.`,
        confirmLabel: "Delete"
      });
      if (!confirmed) return;
      try {
        show(await window.phys0.callTool("delete_world", { world_id: id }));
        selectedWorldId = "world_physical_default";
        await refreshWorlds();
        void refreshRobots();
      } catch (error) {
        show({ delete_world_error: error instanceof Error ? error.message : String(error) });
      }
    });
    titleActions.append(del);
    labelRow.append(title, titleActions);
    const meta = document.createElement("div");
    meta.className = "world-label-meta";
    const defaultRobot = world.default_robot_id ? `default ${String(world.default_robot_id)}` : "no default arm";
    const cameraCount = world.type === "virtual"
      ? worldEntities(id).filter((entity) => entity.kind === "camera").length
      : Array.from(activeBrowserCameraIds).filter((slot) => physicalCameraWorldId(slot) === id).length;
    meta.textContent = `${String(world.type ?? "world")} · ${cameraCount} camera${cameraCount === 1 ? "" : "s"} · ${defaultRobot}`;
    li.append(orb, labelRow, meta);
    li.addEventListener("click", (event) => {
      if ((event.target as HTMLElement | null)?.closest("button")) return;
      void selectWorld(id, { matchExperiment: true });
    });
    worldsList.append(li);
  }
  syncSelectedWorldState();
  renderPickerMenus();
  updateWorldPreviewCanvases();
}

function renderAssetsList(): void {
  assetsList.replaceChildren();
  if (assetsCache.length === 0) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "No canonical assets loaded.";
    assetsList.append(empty);
    return;
  }
  for (const asset of assetsCache) {
    const manifest = (asset.manifest ?? {}) as JsonObject;
    const li = document.createElement("li");
    li.className = "list-item asset-card";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = String(asset.name ?? asset.id);
    const sub = document.createElement("div");
    sub.className = "sub";
    const validation = (manifest.validation ?? {}) as JsonObject;
    const protocols = Array.isArray(manifest.protocols) ? manifest.protocols.join(", ") : "none";
    sub.textContent = `${String(asset.kind ?? "asset")} · ${String(asset.quality ?? "unknown")} · ${String(validation.status ?? "unknown")} · ${protocols}`;
    const detail = document.createElement("div");
    detail.className = "sub asset-detail";
    const formats = Array.isArray(manifest.formats) ? manifest.formats.join(", ") : "";
    detail.textContent = `${String(asset.id ?? "")}${formats ? ` · ${formats}` : ""}`;
    li.append(title, sub, detail);
    li.addEventListener("click", async () => {
      const assetId = String(asset.id ?? "");
      try {
        const [manifestResult, validationResult] = await Promise.all([
          window.phys0.callTool("get_asset_manifest", { asset_id: assetId }),
          window.phys0.callTool("validate_asset", { asset_id: assetId })
        ]);
        show({ ...manifestResult, ...validationResult });
      } catch (error) {
        show({ asset_error: error instanceof Error ? error.message : String(error) });
      }
    });
    assetsList.append(li);
  }
}

async function refreshAssets(): Promise<void> {
  const result = await window.phys0.callTool("list_asset_catalog", {});
  assetsCache = (result.assets ?? []) as JsonObject[];
  renderAssetsList();
}

async function renderProcessGraph(): Promise<void> {
  processGraph.replaceChildren();
  if (!selectedWorldId) return;
  try {
    const [exported, history] = await Promise.all([
      window.phys0.callTool("export_world", { world_id: selectedWorldId }),
      window.phys0.callTool("query_history", { world_id: selectedWorldId, limit: 12 })
    ]);
    const world = (exported.world ?? {}) as JsonObject;
    const groups: Array<[string, JsonObject[]]> = [
      ["Entities", (world.entities ?? []) as JsonObject[]],
      ["Fields", (world.fields ?? []) as JsonObject[]],
      ["Processes", (world.processes ?? []) as JsonObject[]],
      ["Observations", (history.observations ?? []) as JsonObject[]],
      ["Interventions", (history.interventions ?? []) as JsonObject[]]
    ];
    for (const [label, items] of groups) {
      const section = document.createElement("section");
      section.className = "process-graph-section";
      const head = document.createElement("div");
      head.className = "process-graph-head";
      head.textContent = `${label} (${items.length})`;
      section.append(head);
      for (const item of items.slice(0, 8)) {
        const row = document.createElement("button");
        row.className = "process-graph-row";
        row.type = "button";
        row.textContent = `${String(item.kind ?? item.id ?? "item")} · ${String(item.id ?? item.timestamp ?? "")}`;
        row.addEventListener("click", () => show(item));
        section.append(row);
      }
      processGraph.append(section);
    }
  } catch (error) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = `Process graph unavailable: ${error instanceof Error ? error.message : String(error)}`;
    processGraph.append(empty);
  }
}

function startWorldInlineEdit(header: HTMLDivElement, title: HTMLDivElement, world: JsonObject): void {
  const id = String(world.id);
  const input = document.createElement("input");
  input.className = "world-title-input";
  input.value = String(world.name ?? id);
  title.replaceWith(input);
  const actions = header.querySelector<HTMLDivElement>(".row-icon-actions");
  if (!actions) return;
  actions.replaceChildren();
  const save = makeGhostIcon("check", "Save world name");
  save.addEventListener("click", async (event) => {
    event.stopPropagation();
    const name = input.value.trim() || String(world.name ?? id);
    show(await window.phys0.callTool("update_world", { world_id: id, name, metadata: (world.metadata as JsonObject) ?? {} }));
    await refreshWorlds();
  });
  actions.append(save);
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void save.click();
    if (event.key === "Escape") renderWorldsList();
  });
  input.focus();
  input.select();
}

async function refreshWorlds(): Promise<void> {
  const result = await window.phys0.callTool("list_worlds", {});
  worldsCache = (result.worlds ?? []) as JsonObject[];
  assignmentsCache = (result.assignments ?? []) as JsonObject[];
  virtualEntitiesCache = (result.virtual_entities ?? []) as JsonObject[];
  physEntitiesCache = (result.phys_entities ?? []) as JsonObject[];
  if (!worldsCache.some((world) => String(world.id) === selectedWorldId)) {
    selectedWorldId = String(worldsCache[0]?.id ?? "world_physical_default");
  }
  renderWorldsList();
  void renderProcessGraph();
}

function updateExperimentsListSelection(): void {
  for (const li of experimentsList.querySelectorAll<HTMLLIElement>(".list-item")) {
    li.classList.toggle("active", li.dataset.experimentId === experimentId);
  }
}

function updateNotesPane(): void {
  if (!experimentId) {
    experimentMeta.textContent = "No experiment selected";
    experimentNotes.value = "";
    experimentNotes.disabled = true;
    return;
  }
  const experiment = experimentsCache.find((e) => String(e.id) === experimentId);
  experimentMeta.textContent = experiment
    ? JSON.stringify(experiment, null, 2)
    : `id: ${experimentId}`;
  experimentNotes.disabled = false;
  experimentNotes.value = localStorage.getItem(`phys0:notes:${experimentId}`) ?? "";
}

experimentNotes.addEventListener("input", () => {
  if (!experimentId) return;
  localStorage.setItem(`phys0:notes:${experimentId}`, experimentNotes.value);
});

async function clearActiveExperiment(): Promise<void> {
  experimentId = "";
  sessionId = "";
  experimentSelect.value = "";
  setActiveExperimentLabel("No experiment", false);
  updateExperimentsListSelection();
  updateNotesPane();
  updateStatusbar();
  await loadEvents();
  void refreshArtifacts();
  renderPickerMenus();
}

async function selectExperiment(id: string): Promise<void> {
  const experiment = experimentsCache.find((item) => String(item.id) === id);
  if (!experiment) {
    await clearActiveExperiment();
    return;
  }
  setActive(experiment);
  await loadEvents();
  void refreshArtifacts();
  void refreshRobots();
}

async function selectWorld(id: string, options: { matchExperiment?: boolean } = {}): Promise<void> {
  if (!worldsCache.some((world) => String(world.id) === id)) return;
  selectedWorldId = id;
  syncSelectedWorldState();
  renderWorldsList();
  if (options.matchExperiment && experimentId) {
    const activeExperiment = experimentsCache.find((item) => String(item.id) === experimentId);
    if (String(activeExperiment?.world_id ?? "") !== id) {
      const nextExperiment = experimentsCache.find((item) => String(item.world_id ?? "") === id);
      if (nextExperiment) await selectExperiment(String(nextExperiment.id));
      else await clearActiveExperiment();
    }
  } else {
    renderPickerMenus();
  }
  void refreshRobots();
  void renderProcessGraph();
}

async function createExperimentFromCurrentWorld(): Promise<void> {
  try {
    const result = await window.phys0.createExperiment(
      experimentName.value.trim() || "Untitled experiment",
      { app: "electron" },
      selectedWorldId
    );
    show(result);
    setActive(result.experiment as JsonObject, result.session as JsonObject);
    await refreshExperiments();
    await loadEvents();
    void refreshArtifacts();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    show({ create_experiment_error: message });
    appendChat("error", `create_experiment failed: ${message}`);
  }
}

async function refreshExperiments(): Promise<void> {
  const result = await window.phys0.listExperiments();
  const experiments = (result.experiments ?? []) as JsonObject[];
  experimentsCache = experiments;
  experimentSelect.replaceChildren();
  for (const experiment of experiments) {
    const option = document.createElement("option");
    option.value = String(experiment.id);
    option.textContent = `${String(experiment.name)} · ${String(experiment.id)}`;
    experimentSelect.append(option);
  }
  if (!experimentId && experiments[0]) setActive(experiments[0]);
  if (experimentId) experimentSelect.value = experimentId;
  renderExperimentsList();
  renderPickerMenus();
  updateNotesPane();
}

async function refreshArtifacts(): Promise<void> {
  artifactsList.replaceChildren();
  if (!experimentId) {
    const empty = document.createElement("li");
    empty.className = "list-empty";
    empty.textContent = "Select an experiment to see its artifacts.";
    artifactsList.append(empty);
    return;
  }
  try {
    const result = await window.phys0.listArtifacts(experimentId);
    const artifacts = (result.artifacts ?? []) as JsonObject[];
    if (artifacts.length === 0) {
      const empty = document.createElement("li");
      empty.className = "list-empty";
      empty.textContent = "No artifacts for this experiment yet.";
      artifactsList.append(empty);
      return;
    }
    for (const artifact of artifacts) {
      const li = document.createElement("li");
      li.className = "list-item";
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = String(artifact.name ?? artifact.id ?? "artifact");
      const sub = document.createElement("div");
      sub.className = "sub";
      const kind = artifact.kind ?? artifact.mime_type ?? "";
      const size = artifact.size_bytes ?? artifact.size ?? "";
      sub.textContent = [kind, size].filter(Boolean).join(" · ") || String(artifact.id ?? "");
      li.append(title, sub);
      artifactsList.append(li);
    }
  } catch (error) {
    const li = document.createElement("li");
    li.className = "list-empty";
    li.textContent = `Failed to load artifacts: ${error instanceof Error ? error.message : String(error)}`;
    artifactsList.append(li);
  }
}

function textFromTool(result: JsonObject): string {
  const content = result.content;
  if (!Array.isArray(content)) return JSON.stringify(result);
  const first = content[0] as JsonObject | undefined;
  return typeof first?.text === "string" ? (first.text as string) : JSON.stringify(result);
}

async function refreshRobots(): Promise<void> {
  robotsList.replaceChildren();
  try {
    const result = await window.phys0.callTool("list_connected_robots", { max_id: 12 });
    await refreshWorlds();
    let parsed: JsonObject = {};
    try { parsed = JSON.parse(textFromTool(result)) as JsonObject; } catch { parsed = result; }
    const robots = (parsed.robots ?? []) as JsonObject[];
    const assignedOnly = assignmentsCache.filter((item) => String(item.world_id) === selectedWorldId);
    if ((!Array.isArray(robots) || robots.length === 0) && assignedOnly.length === 0) {
      const empty = document.createElement("li");
      empty.className = "list-empty";
      empty.textContent = "No arms detected or assigned. Type a virtual arm id above for virtual worlds.";
      robotsList.append(empty);
      return;
    }
    const renderedRobotIds = new Set<string>();
    for (const robot of robots) {
      const li = document.createElement("li");
      li.className = "list-item";
      const robotId = String(robot.suggested_robot_id ?? robot.robot_id ?? "so101");
      renderedRobotIds.add(robotId);
      const assignment = assignmentsCache.find((item) => String(item.robot_id) === robotId);
      const assignedWorldId = String(assignment?.world_id ?? "world_physical_default");
      if (robotId === defaultRobotId) li.classList.add("active");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = robotId;
      const sub = document.createElement("div");
      sub.className = "sub";
      const worldName = worldsCache.find((world) => String(world.id) === assignedWorldId)?.name ?? assignedWorldId;
      sub.textContent = `${String(robot.port ?? "?")} · ${robot.looks_like_so101 ? "so101" : "unknown"} · ${String(worldName)}`;
      li.append(title, sub);
      li.addEventListener("click", () => {
        defaultRobotInput.value = robotId;
        void assignRobotToSelectedWorld(robot, true);
      });
      robotsList.append(li);
    }
    for (const assignment of assignedOnly) {
      const robotId = String(assignment.robot_id ?? "");
      if (!robotId || renderedRobotIds.has(robotId)) continue;
      const li = document.createElement("li");
      li.className = "list-item";
      if (robotId === defaultRobotId) li.classList.add("active");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = robotId;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = `${String(assignment.robot_kind ?? "robot")} · assigned`;
      li.append(title, sub);
      li.addEventListener("click", () => {
        defaultRobotInput.value = robotId;
        void applyDefaultRobot(robotId);
      });
      robotsList.append(li);
    }
  } catch (error) {
    const li = document.createElement("li");
    li.className = "list-empty";
    li.textContent = `Failed to scan: ${error instanceof Error ? error.message : String(error)}`;
    robotsList.append(li);
  }
}

async function assignRobotToSelectedWorld(robot: JsonObject, makeDefault: boolean): Promise<void> {
  const robotId = String(robot.suggested_robot_id ?? robot.robot_id ?? defaultRobotInput.value).trim();
  if (!robotId) return;
  try {
    const result = await window.phys0.callTool("assign_robot_to_world", {
      robot_id: robotId,
      world_id: selectedWorldId,
      robot_kind: "physical",
      port: typeof robot.port === "string" ? robot.port : null,
      make_default: makeDefault,
      metadata: {
        looks_like_so101: robot.looks_like_so101 === true,
        servo_ids: Array.isArray(robot.servo_ids) ? robot.servo_ids : []
      }
    });
    show(result);
    await refreshWorlds();
    void refreshRobots();
  } catch (error) {
    show({ assign_robot_error: error instanceof Error ? error.message : String(error) });
  }
}

async function applyDefaultRobot(robotId: string): Promise<void> {
  const world = selectedWorld();
  const worldType = String(world?.type ?? "physical");
  await window.phys0.callTool("assign_robot_to_world", {
    robot_id: robotId,
    world_id: selectedWorldId,
    robot_kind: worldType === "virtual" ? "virtual" : "physical",
    make_default: true,
    metadata: { source: "manual" }
  });
  const result = await window.phys0.callTool("set_default_robot", { robot_id: robotId, world_id: selectedWorldId });
  defaultRobotId = String(result.robot_id ?? robotId);
  defaultRobotInput.value = defaultRobotId;
  show(result);
  await refreshWorlds();
  void refreshRobots();
}

async function createVirtualArm(): Promise<void> {
  if (selectedWorld()?.type !== "virtual") {
    show("Select a virtual world before creating a virtual arm.");
    return;
  }
  const result = await window.phys0.callTool("create_virtual_arm", {
    world_id: selectedWorldId,
    name: virtualArmNameInput.value.trim() || "Virtual SO-101",
    make_default: true,
    pose: { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 },
    spec: { model: "so101", collision_mode: "full", collides_with: ["rigid_body"] }
  });
  virtualArmNameInput.value = "";
  show(result);
  await refreshWorlds();
  void refreshRobots();
}

type VirtualTemplate = "empty" | "bench" | "glassware" | "titration" | "weighing";

const VIRTUAL_TEMPLATE_DEFAULT_NAMES: Record<VirtualTemplate, string> = {
  empty: "Virtual world",
  bench: "Bench setup",
  glassware: "Glassware kit",
  titration: "Titration station",
  weighing: "Weighing station"
};

let worldModalTemplate: VirtualTemplate = "empty";

function openWorldModal(mode: "create" | "edit", type: "physical" | "virtual", world?: JsonObject, template: VirtualTemplate = "empty"): void {
  worldModalMode = mode;
  worldModalType = type;
  worldModalTemplate = type === "virtual" ? template : "empty";
  worldModalWorldId = world ? String(world.id ?? "") : "";
  worldModalTitle.textContent = mode === "edit" ? "Edit world" : "New world";
  const kindLabel = type === "virtual" && mode === "create" && template !== "empty"
    ? `virtual · ${VIRTUAL_TEMPLATE_DEFAULT_NAMES[template]}`
    : type;
  worldModalKind.textContent = kindLabel;
  worldModalCreate.textContent = mode === "edit" ? "Save" : "Create";
  const defaultName = type === "virtual"
    ? VIRTUAL_TEMPLATE_DEFAULT_NAMES[worldModalTemplate]
    : "Physical world";
  worldModalName.value = String(world?.name ?? defaultName);
  const metadata = (world?.metadata ?? {}) as JsonObject;
  worldModalNotes.value = typeof metadata.notes === "string" ? metadata.notes : "";
  worldModal.hidden = false;
  worldModalName.focus();
  worldModalName.select();
}

type TemplateEntity =
  | { tool: "arm"; name: string; pose: JsonObject; spec?: JsonObject; make_default?: boolean }
  | { tool: "camera"; name: string; pose: JsonObject; spec?: JsonObject }
  | { tool: "light"; name: string; pose: JsonObject; spec?: JsonObject }
  | { tool: "rigid"; name: string; pose: JsonObject; spec: JsonObject };

// SO-101 sits at world origin (+X = forward in front of the arm, +Z = up).
// Reach is ~0.35 m; workspace is roughly x∈[-0.1, 0.45], y∈[-0.3, 0.3], z∈[0, 0.45].
// Bench-top items live just above z=0 (the bench top is z∈[-0.02, 0]).
const WORKSPACE_TARGET = { x: 0.22, y: 0, z: 0.12 };

// Camera convention: at yaw=0, pitch=0, roll=0 the camera looks down -Y.
// Rotations are applied as Three.js XYZ Euler (intrinsic Rx then Ry then Rz),
// so for a camera with pitch=0 the forward direction reduces to
// [sin(yaw)·cos(roll), -cos(yaw)·cos(roll), -sin(roll)].
// Given a desired look-at target we can solve: yaw = atan2(dx, -dy), roll = -asin(dz).
function cameraPoseLookingAt(pos: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }): JsonObject {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dz = target.z - pos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const nz = dz / len;
  const yawDeg = Math.atan2(dx / len, -(dy / len)) * (180 / Math.PI);
  const rollDeg = -Math.asin(Math.max(-1, Math.min(1, nz))) * (180 / Math.PI);
  const round = (v: number): number => Math.round(v * 10) / 10;
  return { x: pos.x, y: pos.y, z: pos.z, roll: round(rollDeg), pitch: 0, yaw: round(yawDeg) };
}

function templateEntities(template: VirtualTemplate): TemplateEntity[] {
  if (template === "empty") return [];
  // Bench under the arm so glassware has a surface to sit on (z=0 top, ~2cm thick).
  const bench: TemplateEntity = {
    tool: "rigid",
    name: "Bench",
    pose: { x: 0.18, y: 0, z: -0.011 },
    spec: { mass_kg: 0, collision_shape: "box", dimensions_m: [0.7, 0.55, 0.02], asset: "bench" }
  };
  // Two cameras pulled back far enough (~0.85m) to frame the full reach envelope.
  const frontCam: TemplateEntity = {
    tool: "camera",
    name: "Front camera",
    pose: cameraPoseLookingAt({ x: 0.22, y: -0.85, z: 0.45 }, WORKSPACE_TARGET),
    spec: { resolution: "1280x720", fov_degrees: 55 }
  };
  const sideCam: TemplateEntity = {
    tool: "camera",
    name: "Side camera",
    pose: cameraPoseLookingAt({ x: 0.85, y: -0.35, z: 0.4 }, WORKSPACE_TARGET),
    spec: { resolution: "1280x720", fov_degrees: 55 }
  };
  const base: TemplateEntity[] = [
    { tool: "arm", name: "SO-101 arm", pose: { x: 0, y: 0, z: 0 }, make_default: true },
    { tool: "light", name: "Key light", pose: { x: 0.2, y: -0.5, z: 1.1 }, spec: { type: "area", intensity: 1.3, color: "#ffffff" } },
    { tool: "light", name: "Fill light", pose: { x: -0.4, y: 0.4, z: 0.9 }, spec: { type: "area", intensity: 0.7, color: "#f4f7ff" } },
    bench,
    frontCam,
    sideCam
  ];
  if (template === "bench") {
    return [
      ...base,
      { tool: "rigid", name: "Work tray", pose: { x: 0.28, y: 0, z: 0.013 }, spec: { mass_kg: 0.35, collision_shape: "box", dimensions_m: [0.3, 0.22, 0.025], asset: "tray" } },
      { tool: "rigid", name: "Sample box", pose: { x: 0.18, y: 0.22, z: 0.025 }, spec: { mass_kg: 0.1, collision_shape: "box", dimensions_m: [0.06, 0.06, 0.05], asset: "box" } },
      { tool: "rigid", name: "Cylinder marker", pose: { x: 0.18, y: -0.22, z: 0.025 }, spec: { mass_kg: 0.05, collision_shape: "cylinder", radius_m: 0.025, height_m: 0.05, asset: "cylinder" } }
    ];
  }
  if (template === "glassware") {
    // Rack sits flat on the bench (height 0.035 → center z=0.0175). Vials sit in rack holes,
    // tops aligned slightly above rack top, so cylinder center z = rack_top + h/2.
    const rackTop = 0.035;
    return [
      ...base,
      { tool: "rigid", name: "Vial rack 4×3", pose: { x: 0.25, y: 0.08, z: 0.0175 }, spec: { mass_kg: 0.2, collision_shape: "box", dimensions_m: [0.12, 0.09, 0.035], asset: "vial_rack" } },
      { tool: "rigid", name: "Vial 4mL #1", pose: { x: 0.22, y: 0.08, z: rackTop + 0.025 }, spec: { mass_kg: 0.025, collision_shape: "cylinder", radius_m: 0.009, height_m: 0.05, asset: "vial_4ml" } },
      { tool: "rigid", name: "Vial 4mL #2", pose: { x: 0.25, y: 0.08, z: rackTop + 0.025 }, spec: { mass_kg: 0.025, collision_shape: "cylinder", radius_m: 0.009, height_m: 0.05, asset: "vial_4ml" } },
      { tool: "rigid", name: "Vial 4mL #3", pose: { x: 0.28, y: 0.08, z: rackTop + 0.025 }, spec: { mass_kg: 0.025, collision_shape: "cylinder", radius_m: 0.009, height_m: 0.05, asset: "vial_4ml" } },
      { tool: "rigid", name: "Beaker 50mL", pose: { x: 0.18, y: -0.12, z: 0.0275 }, spec: { mass_kg: 0.04, collision_shape: "cylinder", radius_m: 0.021, height_m: 0.055, asset: "beaker_50" } },
      { tool: "rigid", name: "Beaker 250mL", pose: { x: 0.28, y: -0.14, z: 0.0425 }, spec: { mass_kg: 0.11, collision_shape: "cylinder", radius_m: 0.035, height_m: 0.085, asset: "beaker_250" } },
      { tool: "rigid", name: "Graduated cylinder", pose: { x: 0.36, y: 0.05, z: 0.1075 }, spec: { mass_kg: 0.09, collision_shape: "cylinder", radius_m: 0.014, height_m: 0.215, asset: "graduated_cyl_100" } },
      { tool: "rigid", name: "Pipette", pose: { x: 0.12, y: 0.18, z: 0.0025 }, spec: { mass_kg: 0.02, collision_shape: "cylinder", radius_m: 0.005, height_m: 0.22, asset: "pipette" }, /* lays flat */ },
      { tool: "rigid", name: "Petri dish", pose: { x: 0.34, y: -0.05, z: 0.0075 }, spec: { mass_kg: 0.03, collision_shape: "cylinder", radius_m: 0.045, height_m: 0.015, asset: "petri" } }
    ];
  }
  if (template === "titration") {
    // Ring stand base on bench top. Box dims = 0.16×0.1×0.6, centered at z=0.30 so base is at z=0.
    // Stand is offset to the back-left so the burette hangs over the workspace center.
    const standX = 0.32;
    const standY = 0.18;
    return [
      ...base,
      { tool: "rigid", name: "Ring stand", pose: { x: standX, y: standY, z: 0.30 }, spec: { mass_kg: 1.2, collision_shape: "box", dimensions_m: [0.16, 0.1, 0.6], asset: "ring_stand" } },
      // Burette clamped to the stand, tip hanging over the flask. 0.55m tall, centered at z=0.35 → top 0.625, tip 0.075.
      { tool: "rigid", name: "Burette 50mL", pose: { x: standX - 0.10, y: standY, z: 0.35 }, spec: { mass_kg: 0.18, collision_shape: "cylinder", radius_m: 0.012, height_m: 0.55, asset: "burette" } },
      // Erlenmeyer flask directly under the burette tip on the bench.
      { tool: "rigid", name: "Erlenmeyer 250mL", pose: { x: standX - 0.10, y: standY, z: 0.065 }, spec: { mass_kg: 0.13, collision_shape: "cylinder", radius_m: 0.04, height_m: 0.13, asset: "erlenmeyer_250" } },
      { tool: "rigid", name: "Stir bar", pose: { x: standX - 0.10, y: standY, z: 0.0035 }, spec: { mass_kg: 0.005, collision_shape: "cylinder", radius_m: 0.003, height_m: 0.025, asset: "stir_bar" } },
      // Reagent bottle within arm reach on the front-right of the bench.
      { tool: "rigid", name: "Titrant bottle", pose: { x: 0.18, y: -0.18, z: 0.065 }, spec: { mass_kg: 0.25, collision_shape: "cylinder", radius_m: 0.035, height_m: 0.13, asset: "reagent_bottle" } },
      // pH meter to the front-left, electrode area clear for the arm.
      { tool: "rigid", name: "pH meter", pose: { x: 0.10, y: 0.22, z: 0.03 }, spec: { mass_kg: 0.6, collision_shape: "box", dimensions_m: [0.12, 0.18, 0.06], asset: "ph_meter" } },
      // Spare flask to the front-right.
      { tool: "rigid", name: "Beaker 250mL (waste)", pose: { x: 0.28, y: -0.20, z: 0.0425 }, spec: { mass_kg: 0.11, collision_shape: "cylinder", radius_m: 0.035, height_m: 0.085, asset: "beaker_250" } }
    ];
  }
  // Weighing station: balance front-and-center within reach, weigh boat on its pan,
  // reagent bottle + spatula on one side, sample vials on the other.
  const balanceX = 0.30;
  const balanceY = 0.05;
  const balanceTop = 0.12;
  return [
    ...base,
    { tool: "rigid", name: "Analytical balance", pose: { x: balanceX, y: balanceY, z: 0.06 }, spec: { mass_kg: 5, collision_shape: "box", dimensions_m: [0.22, 0.32, 0.12], asset: "balance" } },
    { tool: "rigid", name: "Weigh boat", pose: { x: balanceX, y: balanceY, z: balanceTop + 0.0025 }, spec: { mass_kg: 0.005, collision_shape: "box", dimensions_m: [0.05, 0.05, 0.005], asset: "weigh_boat" } },
    { tool: "rigid", name: "Reagent bottle", pose: { x: 0.12, y: -0.20, z: 0.065 }, spec: { mass_kg: 0.25, collision_shape: "cylinder", radius_m: 0.035, height_m: 0.13, asset: "reagent_bottle" } },
    { tool: "rigid", name: "Spatula", pose: { x: 0.12, y: -0.08, z: 0.0025 }, spec: { mass_kg: 0.01, collision_shape: "box", dimensions_m: [0.12, 0.01, 0.005], asset: "spatula" } },
    { tool: "rigid", name: "Sample vial #1", pose: { x: 0.15, y: 0.22, z: 0.025 }, spec: { mass_kg: 0.025, collision_shape: "cylinder", radius_m: 0.009, height_m: 0.05, asset: "vial_4ml" } },
    { tool: "rigid", name: "Sample vial #2", pose: { x: 0.20, y: 0.22, z: 0.025 }, spec: { mass_kg: 0.025, collision_shape: "cylinder", radius_m: 0.009, height_m: 0.05, asset: "vial_4ml" } },
    { tool: "rigid", name: "Tare pad", pose: { x: 0.10, y: 0.05, z: 0.0025 }, spec: { mass_kg: 0.02, collision_shape: "box", dimensions_m: [0.08, 0.08, 0.005], asset: "plate" } }
  ];
}

async function instantiateTemplate(worldId: string, template: VirtualTemplate): Promise<void> {
  for (const entity of templateEntities(template)) {
    if (entity.tool === "arm") {
      await window.phys0.callTool("create_virtual_arm", { world_id: worldId, name: entity.name, pose: entity.pose, make_default: entity.make_default === true, spec: entity.spec ?? {} });
    } else if (entity.tool === "camera") {
      await window.phys0.callTool("create_virtual_camera", { world_id: worldId, name: entity.name, pose: entity.pose, spec: entity.spec ?? {} });
    } else if (entity.tool === "light") {
      await window.phys0.callTool("create_virtual_light", { world_id: worldId, name: entity.name, pose: entity.pose, spec: entity.spec ?? {} });
    } else {
      await window.phys0.callTool("create_virtual_rigid_body", { world_id: worldId, name: entity.name, pose: entity.pose, spec: entity.spec });
    }
  }
}

function closeWorldModal(): void {
  worldModal.hidden = true;
  worldModalWorldId = "";
}

async function submitWorldModal(): Promise<void> {
  const name = worldModalName.value.trim() || (worldModalType === "virtual" ? "Virtual world" : "Physical world");
  const metadata: JsonObject = {};
  if (worldModalNotes.value.trim()) metadata.notes = worldModalNotes.value.trim();
  if (worldModalMode === "create") {
    const templateMeta = worldModalType === "virtual" && worldModalTemplate !== "empty"
      ? { ...metadata, template: worldModalTemplate }
      : metadata;
    const result = await window.phys0.callTool("create_world", { name, type: worldModalType, metadata: templateMeta });
    const world = result.world as JsonObject | undefined;
    if (world?.id) selectedWorldId = String(world.id);
    show(result);
    if (worldModalType === "virtual" && worldModalTemplate !== "empty" && world?.id) {
      await instantiateTemplate(String(world.id), worldModalTemplate);
    }
  } else {
    const result = await window.phys0.callTool("update_world", { world_id: worldModalWorldId, name, metadata });
    show(result);
  }
  closeWorldModal();
  await refreshWorlds();
  void refreshRobots();
}

async function loadEvents(): Promise<void> {
  if (!experimentId) {
    resetMetricData();
    scheduleMetricRender(true);
    return;
  }
  const result = await window.phys0.listEvents(experimentId);
  renderEvents((result.events ?? []) as JsonObject[]);
  show(result);
}

async function call(name: string, args: JsonObject = {}): Promise<JsonObject> {
  const result = await window.phys0.callTool(name, withExperiment(args));
  show(result);
  return result;
}

function updateCameraVisibility(activeIds: Set<number>): void {
  activeBrowserCameraIds = new Set(activeIds);
  renderSelectedWorldCameras();
  updateWorldPreviewCanvases();
}

function renderSelectedWorldCameras(): void {
  const world = selectedWorld();
  const showPhysicalCameras = world?.type === "physical";
  for (let i = 0; i < camVideos.length; i++) {
    const cell = camVideos[i]?.closest(".camera-cell") as HTMLElement | null;
    if (!cell) continue;
    const assignedHere = showPhysicalCameras && activeBrowserCameraIds.has(i) && physicalCameraWorldId(i) === selectedWorldId;
    cell.classList.toggle("hidden", !assignedHere);
  }
  const selectedVirtualCameras = world?.type === "virtual"
    ? worldEntities(selectedWorldId).filter((entity) => entity.kind === "camera")
    : [];
  const visibleIds = new Set(selectedVirtualCameras.map((camera) => String(camera.id)));
  for (const [id, cell] of virtualCameraCells) {
    if (visibleIds.has(id)) continue;
    cell.remove();
    virtualCameraCells.delete(id);
  }
  for (const camera of selectedVirtualCameras) {
    const id = String(camera.id);
    let cell = virtualCameraCells.get(id);
    if (!cell) {
      cell = document.createElement("div");
      cell.className = "camera-cell virtual-camera-cell";
      cell.dataset.cameraId = id;
      cell.dataset.cameraKind = "virtual";
      const frame = document.createElement("div");
      frame.className = "camera-frame";
      const canvas = document.createElement("canvas");
      canvas.className = "virtual-camera-preview";
      canvas.dataset.cameraId = id;
      frame.append(canvas);
      const label = document.createElement("div");
      label.className = "camera-label";
      cell.append(frame, label);
      camerasStrip.append(cell);
      virtualCameraCells.set(id, cell);
    }
    assignCameraToWorld({ cameraId: id, cameraKind: "virtual", worldId: selectedWorldId });
    const label = cell.querySelector<HTMLElement>(".camera-label");
    const canvas = cell.querySelector<HTMLCanvasElement>("canvas");
    if (label) label.textContent = String(camera.name ?? id);
    if (canvas) {
      canvas.dataset.cameraId = id;
    }
  }
  updateWorldPreviewCanvases();
}

function setCameraLabel(slot: number, label: string): void {
  const cell = camVideos[slot]?.closest(".camera-cell") as HTMLElement | null;
  const labelEl = cell?.querySelector(".camera-label") as HTMLElement | null;
  if (labelEl) labelEl.textContent = label;
}

function isLikelyContinuityCamera(label: string): boolean {
  const lower = label.toLowerCase();
  return lower.includes("iphone") || lower.includes("ipad") || lower.includes("continuity");
}

async function initBrowserCameras(): Promise<void> {
  const active = new Set<number>();
  try {
    const probeStream = await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of probeStream.getTracks()) track.stop();

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices
      .filter((d) => d.kind === "videoinput")
      .filter((d) => !isLikelyContinuityCamera(d.label));

    for (let i = 0; i < camVideos.length; i++) {
      const video = camVideos[i];
      const device = videoDevices[i];
      if (!video || !device) continue;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: device.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });
        video.srcObject = stream;
        camStreams[i] = stream;
        setCameraLabel(i, device.label ? device.label.slice(0, 28) : `cam ${i}`);
        active.add(i);
      } catch (error) {
        console.error(`Failed to open camera slot ${i}`, error);
      }
    }
  } catch (error) {
    console.error("Camera permission denied or unavailable", error);
  }
  updateCameraVisibility(active);
}

window.addEventListener("beforeunload", () => {
  for (const stream of camStreams) {
    if (!stream) continue;
    for (const track of stream.getTracks()) track.stop();
  }
});

/* ------------------------- tabs & sidebars ------------------------- */

const SIDEBAR_TABS: Record<"lhs" | "rhs", string> = {
  lhs: "lhs:experiments",
  rhs: "rhs:chat"
};

const sidebarTabBindings = {
  lhs: window.Phys0Shell.bindPaneTabs({
    buttonsSelector: '.tab-btn[data-tab^="lhs:"]',
    initialTab: SIDEBAR_TABS.lhs,
    onActivate: (tab) => {
      SIDEBAR_TABS.lhs = tab;
      if (!workspace.classList.contains("lhs-collapsed")) return;
      workspace.classList.remove("lhs-collapsed");
      updateToggleButtonStates();
    },
    paneRoot: lhsSidebar
  }),
  rhs: window.Phys0Shell.bindPaneTabs({
    buttonsSelector: '.tab-btn[data-tab^="rhs:"]',
    initialTab: SIDEBAR_TABS.rhs,
    onActivate: (tab) => {
      SIDEBAR_TABS.rhs = tab;
      if (workspace.classList.contains("rhs-collapsed")) {
        workspace.classList.remove("rhs-collapsed");
        updateToggleButtonStates();
      }
      // Catalog canvases have zero size while the pane is hidden; redraw once
      // it becomes visible (e.g. switching to the Metrics tab).
      scheduleMetricRender();
    },
    paneRoot: rhsSidebar
  })
};

function activateTab(tab: string): void {
  const [side] = tab.split(":") as ["lhs" | "rhs"];
  if (side !== "lhs" && side !== "rhs") return;
  sidebarTabBindings[side].activate(tab);
}

function updateToggleButtonStates(): void {
  toggleLhsBtn.classList.toggle("active", !workspace.classList.contains("lhs-collapsed"));
  toggleRhsBtn.classList.toggle("active", !workspace.classList.contains("rhs-collapsed"));
}

toggleLhsBtn.addEventListener("click", () => {
  workspace.classList.toggle("lhs-collapsed");
  updateToggleButtonStates();
  scheduleMetricRender();
});
toggleRhsBtn.addEventListener("click", () => {
  workspace.classList.toggle("rhs-collapsed");
  updateToggleButtonStates();
  scheduleMetricRender();
});

updateToggleButtonStates();

/* --------------------------- boot & actions --------------------------- */

async function boot(): Promise<void> {
  // pH is the canonical live sensor stream; register it up front so its
  // catalog row and pinned 0–14 chart exist before the first sample arrives.
  registerMetric("pH", { min: 0, max: 14 });
  scheduleMetricRender(true);
  const [tools] = await Promise.all([window.phys0.listTools(), refreshWorlds(), refreshAssets()]);
  await refreshExperiments();
  const defaultRobot = await window.phys0.callTool("get_default_robot", { world_id: selectedWorldId });
  defaultRobotId = typeof defaultRobot.robot_id === "string" ? defaultRobot.robot_id : "";
  defaultRobotInput.value = defaultRobotId;
  show(tools);
  await loadEvents();
  void refreshArtifacts();
  void refreshRobots();
  void initBrowserCameras();
  setInterval(() => void refreshRobots(), 8000);
  setInterval(updateWorldPreviewCanvases, 50);
}

document.querySelector("#create-experiment")?.addEventListener("click", () => void createExperimentFromCurrentWorld());

worldSelect.addEventListener("change", () => void selectWorld(worldSelect.value, { matchExperiment: true }));
refreshWorldsBtn.addEventListener("click", async () => {
  await refreshWorlds();
  void refreshRobots();
});
refreshAssetsBtn.addEventListener("click", async () => {
  await refreshAssets();
  void renderProcessGraph();
});

experimentPickerButton.addEventListener("click", () => {
  const nextHidden = !experimentPickerMenu.hidden ? true : false;
  closeAppbarMenus();
  experimentPickerMenu.hidden = nextHidden;
  experimentPickerButton.setAttribute("aria-expanded", String(!nextHidden));
});

worldPickerButton.addEventListener("click", () => {
  const nextHidden = !worldPickerMenu.hidden ? true : false;
  closeAppbarMenus();
  worldPickerMenu.hidden = nextHidden;
  worldPickerButton.setAttribute("aria-expanded", String(!nextHidden));
});

newWorldMenuBtn.addEventListener("click", () => {
  newWorldOptions.hidden = !newWorldOptions.hidden;
});
for (const btn of newWorldOptions.querySelectorAll<HTMLButtonElement>("button[data-world-type]")) {
  btn.addEventListener("click", () => {
    const type = btn.dataset.worldType === "virtual" ? "virtual" : "physical";
    const rawTemplate = btn.dataset.worldTemplate ?? "empty";
    const template: VirtualTemplate = (["empty", "bench", "glassware", "titration", "weighing"] as const).includes(rawTemplate as VirtualTemplate)
      ? (rawTemplate as VirtualTemplate)
      : "empty";
    newWorldOptions.hidden = true;
    openWorldModal("create", type, undefined, template);
  });
}
document.addEventListener("click", (event) => {
  const target = event.target as Node | null;
  if (
    target &&
    !experimentPickerMenu.contains(target) &&
    !experimentPickerButton.contains(target) &&
    !worldPickerMenu.contains(target) &&
    !worldPickerButton.contains(target)
  ) {
    closeAppbarMenus();
  }
  if (!target || newWorldOptions.hidden) return;
  if (newWorldOptions.contains(target) || newWorldMenuBtn.contains(target)) return;
  newWorldOptions.hidden = true;
});
worldModalCancel.addEventListener("click", closeWorldModal);
worldModalCreate.addEventListener("click", () => void submitWorldModal());
worldModal.addEventListener("click", (event) => {
  if (event.target === worldModal) closeWorldModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !worldModal.hidden) closeWorldModal();
});

createVirtualArmBtn.addEventListener("click", () => void createVirtualArm());

experimentSelect.addEventListener("change", () => void selectExperiment(experimentSelect.value));

refreshRobotsBtn.addEventListener("click", () => void refreshRobots());
refreshArtifactsBtn.addEventListener("click", () => void refreshArtifacts());

document.querySelector("#open-record")?.addEventListener("click", async () => show(await window.phys0.openRecordWindow()));
document.querySelector("#open-train")?.addEventListener("click", async () => show(await window.phys0.openTrainWindow()));
document.querySelector("#open-replay")?.addEventListener("click", async () => show(await window.phys0.openReplayWindow()));
document.querySelector("#open-calibration")?.addEventListener("click", async () => show(await window.phys0.openCalibrationWindow()));
openSettingsBtn.addEventListener("click", async () => show(await window.phys0.openSettingsWindow()));
setDefaultRobot.addEventListener("click", async () => {
  const robotId = defaultRobotInput.value.trim();
  if (!robotId) {
    show("Enter a robot_id first.");
    return;
  }
  await applyDefaultRobot(robotId);
});

/* ---------- send / stop (single button that toggles) ---------- */

let inFlight = false;
let inFlightIdleTimer: ReturnType<typeof setTimeout> | null = null;
const IN_FLIGHT_IDLE_MS = 3000;

function setInFlight(value: boolean): void {
  inFlight = value;
  sendMessage.classList.toggle("in-flight", value);
  sendMessage.setAttribute("aria-label", value ? "Stop response" : "Send message");
  if (!value && inFlightIdleTimer) {
    clearTimeout(inFlightIdleTimer);
    inFlightIdleTimer = null;
  }
}

function bumpInFlightIdle(): void {
  if (!inFlight) return;
  if (inFlightIdleTimer) clearTimeout(inFlightIdleTimer);
  inFlightIdleTimer = setTimeout(() => setInFlight(false), IN_FLIGHT_IDLE_MS);
}

sendMessage.addEventListener("click", async () => {
  if (inFlight) {
    // Best-effort UI stop: backend cancellation isn't wired yet, so we just
    // release the in-flight state so the user can compose a new message.
    setInFlight(false);
    assistantBubble = null;
    return;
  }
  await sendToAgent(chatInput.value);
});

async function sendToAgent(raw: string): Promise<void> {
  const message = raw.trim();
  if (!message || !experimentId) return;
  chatInput.value = "";
  assistantBubble = null;
  setInFlight(true);
  bumpInFlightIdle();
  const payload: JsonObject = {
    experiment_id: experimentId,
    message,
    model: "gpt-5.5"
  };
  if (sessionId) payload.session_id = sessionId;
  await window.phys0.sendAgentMessage(payload);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/* ---------- record voice (single toggling button) ---------- */

async function startVoiceRecording(): Promise<void> {
  if (!experimentId) {
    show("Create or select an experiment before recording audio.");
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", () => {
    for (const track of stream.getTracks()) track.stop();
  });
  mediaRecorder.start();
  recordAudio.classList.add("recording");
  recordAudio.setAttribute("aria-label", "Stop recording");
  statusRecDot.hidden = false;
  appendChat("system", "Recording human audio…");
}

async function stopVoiceRecording(): Promise<void> {
  if (!mediaRecorder) return;
  const recorder = mediaRecorder;
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
  recorder.stop();
  await stopped;
  recordAudio.classList.remove("recording");
  recordAudio.setAttribute("aria-label", "Record voice");
  statusRecDot.hidden = true;
  const blob = new Blob(recordedChunks, { type: recorder.mimeType || "audio/webm" });
  mediaRecorder = null;
  const result = await call("listen_to_human", {
    audio_base64: await blobToBase64(blob),
    mime_type: blob.type || "audio/webm"
  });
  const text = typeof result.text === "string" ? result.text.trim() : "";
  if (text) await sendToAgent(text);
}

recordAudio.addEventListener("click", async () => {
  if (mediaRecorder) await stopVoiceRecording();
  else await startVoiceRecording();
});

window.phys0.onAgentEvent((event) => {
  if (event.experiment_id !== experimentId) return;
  if (event.session_id && !sessionId) sessionId = String(event.session_id);
  if (event.type === "message") {
    appendChat(String(event.role ?? "user"), String(event.text ?? ""));
    if (event.role === "assistant") setInFlight(false);
  }
  if (event.type === "assistant_delta") {
    if (!assistantBubble) assistantBubble = appendChat("assistant", "");
    assistantBubble.textContent += String(event.text ?? "");
    chatLog.scrollTop = chatLog.scrollHeight;
    bumpInFlightIdle();
  }
  if (event.type === "tool_response") {
    appendToolBubble(String(event.name ?? "tool"), event.result as JsonObject | undefined);
    assistantBubble = null;
    bumpInFlightIdle();
  }
  if (event.type === "ph_sample") {
    const isNew = ingestSample("pH", Number(event.value), Number(event.timestamp), { min: 0, max: 14 });
    scheduleMetricRender(isNew);
  }
  if (event.type === "metric_sample") {
    scheduleMetricRender(ingestMetricSampleEvent(event));
  }
  if (event.type === "metric_log") {
    ingestMetricLogEvent(event);
    scheduleMetricRender(true);
  }
  if (event.type === "error") {
    appendChat("error", String(event.message ?? ""));
    setInFlight(false);
  }
});

window.addEventListener("resize", () => scheduleMetricRender());
window.addEventListener("phys0:virtual-camera-frame", updateWorldPreviewCanvases);
// Charts read their colors from CSS variables, so a theme switch needs a redraw.
window.phys0.onSettingsChanged(() => scheduleMetricRender());

/* --------------------------- toolbar tooltips --------------------------- */

window.Phys0Shell.installThemeSync({
  getSettings: () => window.phys0.getSettings(),
  onSettingsChanged: (handler) => window.phys0.onSettingsChanged(handler)
});

window.Phys0Shell.installToolbarTooltips({
  getSettings: () => window.phys0.getSettings(),
  onSettingsChanged: (handler) => window.phys0.onSettingsChanged(handler)
});

void boot();
