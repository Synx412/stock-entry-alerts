const instruments = [
  ["AAPL", "Apple Inc.", 225.6], ["NVDA", "NVIDIA", 174.2],
  ["MSFT", "Microsoft", 506.8], ["AMZN", "Amazon", 218.1],
  ["GOOGL", "Alphabet", 238.7], ["TSLA", "Tesla", 429.3],
];

export const names = Object.fromEntries(instruments.map(([symbol, name]) => [symbol, name]));
export const nameOf = symbol => names[symbol] || symbol;
export const symbolsOf = market => Object.keys(market.series);
export const usd = cents => (cents / 100).toLocaleString("en-US", {style:"currency", currency:"USD"});
export const percent = value => (value > 0 ? "+" : "") + value.toFixed(2) + "%";
export const dollarsToCents = value => Math.round(Number(value) * 100);
const dateFormat = new Intl.DateTimeFormat("en-US", {timeZone:"America/New_York", month:"short", day:"numeric", year:"numeric"});
const timeFormat = new Intl.DateTimeFormat("en-US", {timeZone:"America/New_York", hour:"2-digit", minute:"2-digit", hourCycle:"h23"});
const dayFormat = new Intl.DateTimeFormat("en-CA", {timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit"});
export const dayOf = time => dayFormat.format(time);
export const dateOf = time => dateFormat.format(time);
export const timeOf = time => timeFormat.format(time);

export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function demoMarket() {
  const days = ["2025-09-22", "2025-09-23", "2025-09-24", "2025-09-25", "2025-09-26"];
  const times = days.flatMap(day => Array.from({length:78}, (_, i) => Date.parse(day + "T13:35:00Z") + i * 300000));
  const series = {};
  for (const [s, [symbol, , initial]] of instruments.entries()) {
    const random = seeded(824 + s * 813);
    let close = Math.round(initial * 100);
    series[symbol] = times.map((_, i) => {
      const open = close + (i % 78 === 0 && i > 0 ? Math.round((random() - .5) * close * .012) : 0);
      const wave = Math.sin(i / 5 + s * 1.5) * .0008 + Math.cos(i / 12 - s) * .0006;
      const trend = s % 3 === 1 ? -.00010 : .00023;
      close = Math.round(open * (1 + trend + wave + (random() - .48) * .0036));
      const wick = () => 1 + Math.round(random() * open * .00145);
      const volume = Math.round((55000 + 158000 * random()) * (1 + .55 * Math.cos(i % 78 / 78 * 2 * Math.PI)));
      return {o:open, h:Math.max(open, close) + wick(), l:Math.min(open, close) - wick(), c:close, v:volume};
    });
  }
  return {id:"demo-v1", label:"Synthetic replay", times, series, start:35};
}

// Explicit offsets make imports independent of the phone or computer's time zone.
export function parseBarsCSV(text, label = "CSV replay") {
  const lines = text.trim().replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length < 3 || lines.length > 20001) throw Error("Supply 2–20,000 data rows.");
  const headers = lines.shift().toLowerCase().split(",").map(x => x.trim());
  const columns = ["timestamp","symbol","open","high","low","close","volume"].map(k => headers.indexOf(k));
  if (columns.includes(-1) || new Set(headers).size !== headers.length) throw Error("Use a unique timestamp,symbol,open,high,low,close,volume header.");
  const groups = new Map();
  for (const [i, line] of lines.entries()) {
    const fields = line.split(",").map(x => x.trim());
    const [timestamp, ticker, ...numbers] = columns.map(j => fields[j] ?? "");
    const symbol = ticker.toUpperCase();
    const t = Date.parse(timestamp);
    const priceFields = numbers.slice(0,4);
    const [o,h,l,c] = priceFields.map(dollarsToCents);
    const v = Number(numbers[4]);
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) || !Number.isFinite(t) ||
        !priceFields.every(x => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(x)) ||
        ![o,h,l,c].every(x => Number.isSafeInteger(x) && x >= 1 && x <= 100000000) ||
        l > Math.min(o,c) || h < Math.max(o,c) ||
        !/^\d+$/.test(numbers[4]) || !Number.isSafeInteger(v) || v > 1e12) {
      throw Error("Invalid price, volume, ticker or timestamp on row " + (i + 2) + ".");
    }
    if (!groups.has(symbol)) groups.set(symbol, new Map());
    const group = groups.get(symbol);
    if (group.has(t)) throw Error("Duplicate timestamp for " + symbol + " on row " + (i + 2) + ".");
    group.set(t, {o,h,l,c,v});
  }
  if (groups.size > 20) throw Error("Import at most 20 tickers per replay.");
  const times = [...groups.values().next().value.keys()].sort((a,b) => a - b);
  if (times.length < 2) throw Error("Each ticker needs at least two bars.");
  const series = {};
  for (const [symbol, group] of groups) {
    if (group.size !== times.length || times.some(t => !group.has(t))) throw Error("All tickers must have the same timestamps. Try importing a single ticker.");
    series[symbol] = times.map(t => group.get(t));
  }
  return {id:crypto.randomUUID(), label:String(label).slice(0,78), times, series, start:Math.min(35, Math.floor((times.length - 1) / 3))};
}

export function sessionStart(times, index) {
  const date = dayOf(times[index]);
  let start = index;
  while (start > 0 && dayOf(times[start - 1]) === date) start--;
  return start;
}

export function snapshot(market, symbol, index) {
  const all = market.series[symbol];
  const start = sessionStart(market.times,index);
  const bars = all.slice(start,index + 1);
  const last = bars.at(-1);
  const open = bars[0].o;
  let volume = 0, weighted = 0, high = 0, low = Infinity;
  for (const bar of bars) {
    volume += bar.v;
    weighted += (bar.h + bar.l + bar.c) / 3 * bar.v;
    high = Math.max(high,bar.h);
    low = Math.min(low,bar.l);
  }
  return {bars, last, open, change:last.c - open, changePct:(last.c / open - 1) * 100, high, low, volume, vwap:volume ? weighted / volume : null};
}

export function simulation(market, symbol, index, horizon = 12, trials = 10000) {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 78) throw Error("Choose 1–78 future bars.");
  const bars = market.series[symbol];
  const returns = [];
  let previousDay = "";
  for (let i = Math.max(0,index - 252); i <= index; i++) {
    const day = dayOf(market.times[i]);
    if (i > 0 && day === previousDay) returns.push(bars[i].c / bars[i-1].c);
    previousDay = day;
  }
  if (returns.length < 5) throw Error("Advance until at least six bars from one session are visible.");
  const price = bars[index].c;
  const random = seeded(symbol.split("").reduce((s,c) => s * 31 + c.charCodeAt(0),1) + index * 71 + horizon);
  const outcomes = new Array(trials);
  let above = 0;
  for (let i = 0; i < trials; i++) {
    let result = price;
    for (let j = 0; j < horizon; j++) result *= returns[Math.floor(random() * returns.length)];
    outcomes[i] = result;
    if (result > price) above++;
  }
  outcomes.sort((a,b) => a - b);
  const quantile = p => Math.round(outcomes[Math.floor((trials - 1) * p)]);
  return {low:quantile(.1), median:quantile(.5), high:quantile(.9), above:100 * above / trials, observations:returns.length};
}
