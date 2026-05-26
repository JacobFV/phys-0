import { contextBridge, ipcRenderer } from "electron";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

contextBridge.exposeInMainWorld("phys0", {
  listTools: () => ipcRenderer.invoke("phys0:tools-list"),
  readResource: (uri: string) => ipcRenderer.invoke("phys0:resource-read", uri),
  readUrdf: () => ipcRenderer.invoke("phys0:urdf-read"),
  callTool: (name: string, args: JsonObject = {}) => ipcRenderer.invoke("phys0:tool-call", name, args),
  createExperiment: (name: string, metadata: JsonObject = {}, worldId?: string) =>
    ipcRenderer.invoke("phys0:create-experiment", name, metadata, worldId),
  listExperiments: () => ipcRenderer.invoke("phys0:list-experiments"),
  listEvents: (experimentId: string) => ipcRenderer.invoke("phys0:list-events", experimentId),
  listArtifacts: (experimentId: string) => ipcRenderer.invoke("phys0:list-artifacts", experimentId),
  sendAgentMessage: (input: JsonObject) => ipcRenderer.invoke("phys0:agent-message", input),
  readJsonFile: (filePath: string) => ipcRenderer.invoke("phys0:read-json-file", filePath),
  openCalibrationWindow: (robotId: string, port: string) =>
    ipcRenderer.invoke("phys0:open-calibration-window", { robotId, port }),
  openRecordWindow: () => ipcRenderer.invoke("phys0:open-record-window"),
  openTrainWindow: () => ipcRenderer.invoke("phys0:open-train-window"),
  openReplayWindow: () => ipcRenderer.invoke("phys0:open-replay-window"),
  openSettingsWindow: () => ipcRenderer.invoke("phys0:open-settings-window"),
  openVirtualWorldWindow: (worldId: string) => ipcRenderer.invoke("phys0:open-virtual-world-window", worldId),
  openWorkbenchWindow: (tab?: string) => ipcRenderer.invoke("phys0:open-workbench-window", tab),
  detachWorkbenchTab: (tab: string) => ipcRenderer.invoke("phys0:detach-workbench-tab", tab),
  onWorkbenchSetTab: (callback: (payload: { tab: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { tab: string }) => callback(payload);
    ipcRenderer.on("phys0:workbench-set-tab", listener);
    return () => ipcRenderer.removeListener("phys0:workbench-set-tab", listener);
  },
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke("phys0:get-settings"),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke("phys0:set-setting", key, value),
  onSettingsChanged: (callback: (settings: JsonObject) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: JsonObject) => callback(payload);
    ipcRenderer.on("phys0:settings-changed", listener);
    return () => ipcRenderer.removeListener("phys0:settings-changed", listener);
  },
  onAgentEvent: (callback: (event: JsonObject) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: JsonObject) => callback(payload);
    ipcRenderer.on("phys0:agent-event", listener);
    return () => ipcRenderer.removeListener("phys0:agent-event", listener);
  }
});
