const PROXIABLE_ACTIONS = /* @__PURE__ */ new Set([
  "get_last_update_time",
  "get_browser_state",
  "update_tree",
  "clean_up_highlights",
  "hide_mask_now",
  "hide_fixed_elements",
  "restore_fixed_elements",
  "click_element",
  "input_text",
  "select_option",
  "scroll",
  "scroll_horizontally",
  "get_scroll_info",
  "scroll_to_position"
]);
function handlePageControlMessage(message, sender, sendResponse) {
  var _a;
  const PREFIX2 = "[RemotePageController.background]";
  if (sender.id !== chrome.runtime.id) {
    console.warn(PREFIX2, "Rejected message from unknown sender", sender.id);
    sendResponse({ success: false, error: "Unauthorized sender" });
    return;
  }
  const { action, payload, targetTabId } = message;
  if (action === "get_my_tab_id") {
    sendResponse({ tabId: ((_a = sender.tab) == null ? void 0 : _a.id) ?? null });
    return;
  }
  if (!PROXIABLE_ACTIONS.has(action)) {
    console.warn(PREFIX2, `Blocked disallowed action: ${action}`);
    sendResponse({ success: false, error: `Action '${action}' is not permitted` });
    return;
  }
  chrome.tabs.sendMessage(targetTabId, { type: "PAGE_CONTROL", action, payload }).then((result) => sendResponse(result)).catch((error) => {
    console.error(PREFIX2, error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  });
  return true;
}
function isSafeUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "URL is not valid" };
  }
  if (!["http:", "https:"].includes(u.protocol)) {
    return { ok: false, reason: `Scheme '${u.protocol}' is not allowed (only http and https)` };
  }
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || /^127\./.test(host) || // entire 127.0.0.0/8 block
  host === "0.0.0.0" || host === "::1" || host === "[::1]" || host === "0:0:0:0:0:0:0:0" || host === "[0:0:0:0:0:0:0:0]" || /^\[?::ffff:/i.test(host)) {
    return { ok: false, reason: "Loopback addresses are not allowed" };
  }
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    return { ok: false, reason: "Private IP ranges are not allowed" };
  }
  if (/^169\.254\./.test(host)) {
    return { ok: false, reason: "Link-local addresses are not allowed" };
  }
  return { ok: true };
}
const PREFIX = "[TabsController.background]";
const debug = console.debug.bind(console, `\x1B[90m${PREFIX}\x1B[0m`);
async function resolveActiveTab(payload, sender) {
  const windowId = payload == null ? void 0 : payload.windowId;
  if (windowId != null) {
    debug("get_active_tab: resolving via caller-reported windowId", windowId);
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (!tab) throw new Error(`No active tab found in window ${windowId}.`);
    return tab;
  }
  if (sender.tab) {
    debug("get_active_tab: resolving via sender.tab (content script)", sender.tab.id);
    return sender.tab;
  }
  throw new Error(
    "Cannot resolve active tab: caller reported no windowId and is not a content script (no sender.tab)."
  );
}
function handleTabControlMessage(message, sender, sendResponse) {
  const { action, payload } = message;
  switch (action) {
    case "get_active_tab": {
      debug("get_active_tab", payload);
      resolveActiveTab(payload, sender).then((tab) => {
        debug("get_active_tab: success", tab);
        sendResponse({ success: true, tab });
      }).catch((error) => {
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
    case "get_tab_info": {
      debug("get_tab_info", payload);
      chrome.tabs.get(payload.tabId).then((tab) => {
        debug("get_tab_info: success", tab);
        sendResponse(tab);
      }).catch((error) => {
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
    case "open_new_tab": {
      debug("open_new_tab", payload);
      const urlCheck = isSafeUrl(payload.url);
      if (!urlCheck.ok) {
        sendResponse({ error: `URL rejected: ${urlCheck.reason}` });
        return;
      }
      chrome.tabs.create({ url: payload.url, windowId: payload.windowId, active: true }).then((newTab) => {
        debug("open_new_tab: success", newTab);
        sendResponse({ success: true, tabId: newTab.id });
      }).catch((error) => {
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
    case "create_tab_group": {
      debug("create_tab_group", payload);
      chrome.tabs.group({ tabIds: payload.tabIds, createProperties: { windowId: payload.windowId } }).then((groupId) => {
        debug("create_tab_group: success", groupId);
        sendResponse({ success: true, groupId });
      }).catch((error) => {
        console.error(PREFIX, "Failed to create tab group", error);
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
    case "update_tab_group": {
      debug("update_tab_group", payload);
      chrome.tabGroups.update(payload.groupId, payload.properties).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
    case "add_tab_to_group": {
      debug("add_tab_to_group", payload);
      chrome.tabs.group({ tabIds: payload.tabId, groupId: payload.groupId }).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
    case "activate_tab": {
      debug("activate_tab", payload);
      chrome.tabs.update(payload.tabId, { active: true }).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
    case "close_tab": {
      debug("close_tab", payload);
      chrome.tabs.remove(payload.tabId).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
    case "get_window_tabs": {
      chrome.tabs.query({ windowId: payload.windowId }).then((tabs) => {
        sendResponse({ success: true, tabs });
      }).catch((error) => {
        sendResponse({ error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
    default:
      sendResponse({ error: `Unknown action: ${action}` });
      return;
  }
}
const MAX_SEGMENTS = 15;
function handleScreenshotMessage(message, _sender, sendResponse) {
  var _a;
  const targetTabId = (_a = message.payload) == null ? void 0 : _a.targetTabId;
  if (message.action === "capture_full_page") {
    captureFullPage(targetTabId).then((entry) => sendResponse({ success: true, entry })).catch((error) => {
      console.error("[Screenshot.background]", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });
    return true;
  }
  if (message.action === "capture_visible") {
    captureVisible(targetTabId).then((entry) => sendResponse({ success: true, entry })).catch((error) => {
      console.error("[Screenshot.background]", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });
    return true;
  }
  sendResponse({ success: false, error: `Unknown screenshot action: ${message.action}` });
  return void 0;
}
async function captureFullPage(targetTabId) {
  const tab = await resolveTargetTab(targetTabId);
  if (!tab.id || tab.windowId === void 0) throw new Error("Could not resolve a target tab.");
  if (!tab.active) {
    await chrome.tabs.update(tab.id, { active: true });
    await delay(350);
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "PAGE_CONTROL", action: "hide_mask_now" });
    await delay(80);
  } catch {
  }
  try {
    return await captureFullPageViaDebugger(tab);
  } catch (error) {
    console.warn("[Screenshot.background] CDP capture failed, falling back to stitch:", error);
    return await captureFullPageViaStitch(tab);
  }
}
const MAX_DEVICE_PX = 16384;
async function captureFullPageViaDebugger(tab) {
  var _a, _b, _c;
  const dbg = { tabId: tab.id };
  await chrome.debugger.attach(dbg, "1.3");
  try {
    await sweepForLazyContent(tab.id);
    const metrics = await chrome.debugger.sendCommand(dbg, "Page.getLayoutMetrics");
    const size = metrics.cssContentSize ?? metrics.contentSize;
    if (!size) throw new Error("Page.getLayoutMetrics returned no content size");
    const ev = await chrome.debugger.sendCommand(dbg, "Runtime.evaluate", {
      expression: "window.devicePixelRatio",
      returnByValue: true
    });
    const dpr = typeof ((_a = ev == null ? void 0 : ev.result) == null ? void 0 : _a.value) === "number" && ev.result.value > 0 ? ev.result.value : 1;
    const maxCssHeight = Math.floor(MAX_DEVICE_PX / dpr) - 8;
    const truncated = size.height > maxCssHeight;
    const params = {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true
    };
    if (truncated) {
      params.clip = { x: 0, y: 0, width: size.width, height: maxCssHeight, scale: 1 };
    }
    const shot = await chrome.debugger.sendCommand(dbg, "Page.captureScreenshot", params);
    if (!(shot == null ? void 0 : shot.data)) throw new Error("Page.captureScreenshot returned no data");
    return {
      segments: [`data:image/png;base64,${shot.data}`],
      offsets: [0],
      scrollHeight: size.height,
      viewportHeight: ((_b = metrics.cssVisualViewport) == null ? void 0 : _b.clientHeight) ?? 0,
      viewportWidth: ((_c = metrics.cssVisualViewport) == null ? void 0 : _c.clientWidth) ?? 0,
      truncated,
      tabUrl: tab.url ?? "",
      tabTitle: tab.title ?? ""
    };
  } finally {
    await chrome.debugger.detach(dbg).catch(() => {
    });
    await chrome.tabs.sendMessage(tab.id, { type: "PAGE_CONTROL", action: "restore_fixed_elements" }).catch(() => {
    });
  }
}
async function sweepForLazyContent(tabId) {
  try {
    const info = await chrome.tabs.sendMessage(tabId, {
      type: "PAGE_CONTROL",
      action: "get_scroll_info"
    });
    if (!info || info.scrollHeight <= info.viewportHeight + 50) return;
    const maxSweep = Math.min(info.scrollHeight, info.viewportHeight * 20);
    for (let y = info.viewportHeight; y < maxSweep; y += info.viewportHeight) {
      await chrome.tabs.sendMessage(tabId, {
        type: "PAGE_CONTROL",
        action: "scroll_to_position",
        payload: { y }
      });
      await delay(150);
    }
    await chrome.tabs.sendMessage(tabId, {
      type: "PAGE_CONTROL",
      action: "scroll_to_position",
      payload: { y: 0 }
    });
    await delay(350);
  } catch {
  }
}
async function captureFullPageViaStitch(tab) {
  const tabId = tab.id;
  let scrollHeight = 0;
  let viewportHeight = 0;
  let viewportWidth = 0;
  let originalScrollY = 0;
  try {
    const info = await chrome.tabs.sendMessage(tabId, {
      type: "PAGE_CONTROL",
      action: "get_scroll_info"
    });
    scrollHeight = info.scrollHeight;
    viewportHeight = info.viewportHeight;
    viewportWidth = info.viewportWidth;
    originalScrollY = info.scrollY;
  } catch {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    return { segments: [dataUrl], offsets: [0], scrollHeight: 0, viewportHeight: 0, viewportWidth: 0, truncated: false, tabUrl: tab.url ?? "", tabTitle: tab.title ?? "" };
  }
  if (scrollHeight <= viewportHeight + 50) {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    return { segments: [dataUrl], offsets: [0], scrollHeight, viewportHeight, viewportWidth, truncated: false, tabUrl: tab.url ?? "", tabTitle: tab.title ?? "" };
  }
  const scrollTo = async (y) => {
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: "PAGE_CONTROL",
      action: "scroll_to_position",
      payload: { y }
    }).catch(() => null);
    return typeof (res == null ? void 0 : res.y) === "number" ? res.y : null;
  };
  const segments = [];
  const offsets = [];
  let truncated = false;
  try {
    await scrollTo(0);
    await delay(120);
    segments.push(await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }));
    offsets.push(0);
    await chrome.tabs.sendMessage(tabId, {
      type: "PAGE_CONTROL",
      action: "hide_fixed_elements"
    }).catch(() => {
    });
    let targetY = viewportHeight;
    while (targetY < scrollHeight && segments.length < MAX_SEGMENTS) {
      const scrolledY = await scrollTo(targetY);
      if (scrolledY === null || scrolledY <= offsets[offsets.length - 1]) break;
      await delay(500);
      const fresh = await chrome.tabs.sendMessage(tab.id, { type: "PAGE_CONTROL", action: "get_scroll_info" }).catch(() => null);
      const actualY = (fresh == null ? void 0 : fresh.scrollY) ?? scrolledY;
      if (actualY <= offsets[offsets.length - 1]) break;
      if (fresh && Math.abs(fresh.scrollHeight - scrollHeight) > viewportHeight * 0.2) {
        truncated = true;
        break;
      }
      segments.push(await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }));
      offsets.push(actualY);
      if (actualY < targetY) break;
      targetY = actualY + viewportHeight;
    }
    truncated = truncated || segments.length === MAX_SEGMENTS && targetY < scrollHeight;
  } finally {
    await chrome.tabs.sendMessage(tabId, {
      type: "PAGE_CONTROL",
      action: "restore_fixed_elements"
    }).catch(() => {
    });
  }
  await scrollTo(originalScrollY);
  return { segments, offsets, scrollHeight, viewportHeight, viewportWidth, truncated, tabUrl: tab.url ?? "", tabTitle: tab.title ?? "" };
}
async function captureVisible(targetTabId) {
  const tab = await resolveTargetTab(targetTabId);
  if (!tab.id || tab.windowId === void 0) throw new Error("Could not resolve a target tab.");
  if (!tab.active) {
    await chrome.tabs.update(tab.id, { active: true });
    await delay(350);
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "PAGE_CONTROL", action: "hide_mask_now" });
    await delay(150);
  } catch {
  }
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  return { segments: [dataUrl], offsets: [0], scrollHeight: 0, viewportHeight: 0, viewportWidth: 0, truncated: false, tabUrl: tab.url ?? "", tabTitle: tab.title ?? "" };
}
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function resolveTargetTab(targetTabId) {
  if (targetTabId !== void 0) return chrome.tabs.get(targetTabId);
  const { currentTabId } = await chrome.storage.local.get("currentTabId");
  if (typeof currentTabId === "number") {
    try {
      return await chrome.tabs.get(currentTabId);
    } catch {
    }
  }
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!active) throw new Error("No active tab found.");
  return active;
}
console.log("[Background] PRIVO Page Agent service worker started");
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ error: "Unauthorized sender" });
    return;
  }
  if ((message == null ? void 0 : message.type) === "TAB_CONTROL") {
    return handleTabControlMessage(message, sender, sendResponse);
  } else if ((message == null ? void 0 : message.type) === "PAGE_CONTROL") {
    return handlePageControlMessage(message, sender, sendResponse);
  } else if ((message == null ? void 0 : message.type) === "SCREENSHOT_CONTROL") {
    return handleScreenshotMessage(message, sender, sendResponse);
  } else {
    sendResponse({ error: "Unknown message type" });
    return;
  }
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
});
