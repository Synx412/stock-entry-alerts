import { firebaseConfig, vapidKey } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js";

const presets = [
  ["Nifty 50 ETF", "NIFTYBEES.NS"],
  ["Nifty Next 50 ETF", "JUNIORBEES.NS"],
  ["Nifty Midcap 150 ETF", "MID150BEES.NS"],
  ["Reliance", "RELIANCE.NS"],
  ["TCS", "TCS.NS"],
  ["HDFC Bank", "HDFCBANK.NS"],
  ["Apple", "AAPL"],
  ["Microsoft", "MSFT"],
  ["Nvidia", "NVDA"],
  ["S&P 500 ETF", "SPY"],
  ["Total World ETF", "VT"]
];

const state = {
  app: null,
  auth: null,
  db: null,
  messaging: null,
  uid: null,
  installPrompt: null,
  watchItems: [],
  analyses: new Map()
};

const els = {
  setupWarning: document.querySelector("#setupWarning"),
  installButton: document.querySelector("#installButton"),
  notificationButton: document.querySelector("#notificationButton"),
  notificationState: document.querySelector("#notificationState"),
  presetRow: document.querySelector("#presetRow"),
  watchForm: document.querySelector("#watchForm"),
  tickerInput: document.querySelector("#tickerInput"),
  nameInput: document.querySelector("#nameInput"),
  modeInput: document.querySelector("#modeInput"),
  scoreInput: document.querySelector("#scoreInput"),
  priceInput: document.querySelector("#priceInput"),
  enabledInput: document.querySelector("#enabledInput"),
  refreshButton: document.querySelector("#refreshButton"),
  statusMessage: document.querySelector("#statusMessage"),
  watchlist: document.querySelector("#watchlist"),
  template: document.querySelector("#assetCardTemplate")
};

function configReady() {
  return !Object.values(firebaseConfig).some(value => String(value).includes("REPLACE_"))
    && !String(vapidKey).includes("REPLACE_");
}

function tickerDocId(ticker) {
  return ticker.trim().toUpperCase().replaceAll("/", "_");
}

function currencyForTicker(ticker) {
  return ticker.toUpperCase().endsWith(".NS") ? "INR" : "USD";
}

function formatPrice(value, currency = "INR") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(Number(value));
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function setStatus(message) {
  els.statusMessage.textContent = message;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
}

function renderPresets() {
  for (const [name, ticker] of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset";
    button.textContent = name;
    button.addEventListener("click", () => {
      els.nameInput.value = name;
      els.tickerInput.value = ticker;
      els.tickerInput.focus();
    });
    els.presetRow.append(button);
  }
}

async function initFirebase() {
  if (!configReady()) {
    els.setupWarning.classList.remove("hidden");
    setStatus("Firebase configuration has not been added yet.");
    return;
  }

  state.app = initializeApp(firebaseConfig);
  state.auth = getAuth(state.app);
  state.db = getFirestore(state.app);

  onAuthStateChanged(state.auth, async user => {
    if (!user) return;
    state.uid = user.uid;

    await setDoc(doc(state.db, "users", state.uid), {
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      locale: "en-IN"
    }, { merge: true });

    await loadData();
  });

  await signInAnonymously(state.auth);

  if (await isSupported()) {
    state.messaging = getMessaging(state.app);
    onMessage(state.messaging, payload => {
      const title = payload?.notification?.title || "Stock Entry Alert";
      const body = payload?.notification?.body || "A watchlist condition has been reached.";
      if (Notification.permission === "granted") {
        new Notification(title, { body, icon: "./icons/icon-192.png" });
      }
      loadData();
    });
  }
}

async function enableNotifications() {
  if (!state.uid || !state.messaging) {
    alert("Firebase Messaging is not ready. Check the setup instructions.");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    els.notificationState.textContent = "Permission denied";
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(state.messaging, {
    vapidKey,
    serviceWorkerRegistration: registration
  });

  if (!token) {
    throw new Error("No push token was returned.");
  }

  const tokenId = await sha256(token);
  await setDoc(doc(state.db, "users", state.uid, "devices", tokenId), {
    token,
    createdAt: serverTimestamp(),
    userAgent: navigator.userAgent
  }, { merge: true });

  els.notificationState.textContent = "Enabled";
  els.notificationState.className = "pill good";
  els.notificationButton.textContent = "Notifications enabled";
}

async function saveWatchItem(event) {
  event.preventDefault();
  if (!state.uid) return;

  const ticker = els.tickerInput.value.trim().toUpperCase();
  if (!ticker) return;

  const payload = {
    ticker,
    name: els.nameInput.value.trim() || ticker,
    mode: els.modeInput.value,
    minScore: Number(els.scoreInput.value || 68),
    maxBuyPrice: Number(els.priceInput.value || 0),
    currency: currencyForTicker(ticker),
    enabled: els.enabledInput.checked,
    updatedAt: serverTimestamp()
  };

  await setDoc(
    doc(state.db, "users", state.uid, "watchlist", tickerDocId(ticker)),
    payload,
    { merge: true }
  );

  els.watchForm.reset();
  els.scoreInput.value = "68";
  els.priceInput.value = "0";
  els.enabledInput.checked = true;
  setStatus(`${ticker} saved. The scheduled scanner will update it after the next run.`);
  await loadData();
}

async function deleteWatchItem(ticker) {
  if (!state.uid) return;
  if (!confirm(`Delete ${ticker} from the watchlist?`)) return;
  await deleteDoc(doc(state.db, "users", state.uid, "watchlist", tickerDocId(ticker)));
  await loadData();
}

function editWatchItem(item) {
  els.tickerInput.value = item.ticker;
  els.nameInput.value = item.name || item.ticker;
  els.modeInput.value = item.mode || "long-term";
  els.scoreInput.value = item.minScore ?? 68;
  els.priceInput.value = item.maxBuyPrice ?? 0;
  els.enabledInput.checked = item.enabled !== false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function signalClass(score) {
  if (score >= 78) return "strong";
  if (score >= 68) return "buy";
  if (score >= 58) return "watch";
  if (score >= 45) return "neutral";
  return "weak";
}

function renderWatchlist() {
  els.watchlist.innerHTML = "";

  if (!state.watchItems.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Your watchlist is empty. Add NIFTYBEES.NS or another ticker above.";
    els.watchlist.append(empty);
    return;
  }

  for (const item of state.watchItems) {
    const analysis = state.analyses.get(tickerDocId(item.ticker));
    const card = els.template.content.firstElementChild.cloneNode(true);

    card.querySelector(".asset-name").textContent = item.name || item.ticker;
    card.querySelector(".asset-ticker").textContent =
      `${item.ticker} · Alert ≥ ${item.minScore ?? 68}`;

    const score = Number(analysis?.score ?? 0);
    const badge = card.querySelector(".score-badge");
    badge.textContent = analysis ? `${score.toFixed(0)}/100` : "Pending";
    badge.classList.add(signalClass(score));

    card.querySelector(".asset-price").textContent =
      analysis ? formatPrice(analysis.price, analysis.currency || item.currency) : "Awaiting scan";

    const daily = card.querySelector(".asset-daily");
    daily.textContent = analysis ? formatPercent(analysis.dailyReturn) : "";
    daily.classList.add(Number(analysis?.dailyReturn) >= 0 ? "positive" : "negative");

    card.querySelector(".asset-signal").textContent =
      analysis?.signal || "The scheduled scanner has not analysed this ticker yet.";

    card.querySelector(".metric-rsi").textContent =
      analysis?.rsi == null ? "—" : Number(analysis.rsi).toFixed(1);
    card.querySelector(".metric-ma50").textContent =
      analysis ? formatPercent(analysis.distance50) : "—";
    card.querySelector(".metric-dd").textContent =
      analysis ? formatPercent(analysis.drawdown52) : "—";
    card.querySelector(".metric-vol").textContent =
      analysis ? formatPercent(analysis.annualVolatility) : "—";

    card.querySelector(".condition-text").textContent =
      analysis?.waitFor || "Run the scanner workflow to calculate the next favourable condition.";

    card.querySelector(".buy-zone").textContent = analysis
      ? `Technical zone: ${formatPrice(analysis.buyZoneLow, analysis.currency)} – ${formatPrice(analysis.buyZoneHigh, analysis.currency)}`
      : `Your price alert: ${item.maxBuyPrice > 0 ? formatPrice(item.maxBuyPrice, item.currency) : "disabled"}`;

    card.querySelector(".updated").textContent =
      analysis?.marketDate ? `Market data: ${analysis.marketDate}` : "";

    card.querySelector(".edit-button").addEventListener("click", () => editWatchItem(item));
    card.querySelector(".delete-button").addEventListener("click", () => deleteWatchItem(item.ticker));

    els.watchlist.append(card);
  }
}

async function loadData() {
  if (!state.uid || !state.db) return;
  setStatus("Loading your watchlist…");

  const watchSnapshot = await getDocs(collection(state.db, "users", state.uid, "watchlist"));
  state.watchItems = watchSnapshot.docs
    .map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
    .sort((a, b) => (a.name || a.ticker).localeCompare(b.name || b.ticker));

  const analysisSnapshot = await getDocs(collection(state.db, "users", state.uid, "analysis"));
  state.analyses = new Map(
    analysisSnapshot.docs.map(snapshot => [snapshot.id, snapshot.data()])
  );

  renderWatchlist();
  setStatus(`Loaded ${state.watchItems.length} watchlist item(s).`);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  await navigator.serviceWorker.register("./firebase-messaging-sw.js", { scope: "./" });
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  state.installPrompt = event;
  els.installButton.classList.remove("hidden");
});

els.installButton.addEventListener("click", async () => {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  els.installButton.classList.add("hidden");
});

els.notificationButton.addEventListener("click", () => {
  enableNotifications().catch(error => alert(error.message));
});
els.watchForm.addEventListener("submit", event => {
  saveWatchItem(event).catch(error => alert(error.message));
});
els.refreshButton.addEventListener("click", () => {
  loadData().catch(error => alert(error.message));
});

renderPresets();
registerServiceWorker()
  .then(initFirebase)
  .catch(error => {
    console.error(error);
    setStatus(error.message);
  });
