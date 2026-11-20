import {usd,percent,dateOf,timeOf,symbolsOf,nameOf,snapshot,simulation,dollarsToCents,dayOf} from "./market.mjs";
import {availableCash,equity,sizePosition,STARTING_CASH} from "./broker.mjs";
import {headlines,earnings,disclosures,houseReport,filingDate} from "./archive.mjs";
import {esc,stats,table,tickerOptions} from "./view.mjs";

export const toolList = {
  scanner:"Chart scanner", news:"News monitor", entry:"Entry timer", exit:"Exit planner",
  simulation:"Time machine", risk:"Risk manager", budget:"Budget manager", broker:"Paper broker",
  alerts:"Price alerts", earnings:"Earnings analyst", congress:"Pelosi tracker"
};
const hints = {
  scanner:"Rank the replay tickers by their move from this session’s opening price.",
  news:"Browse dated publisher announcements available before the replay date.",
  entry:"Compare the last close with the prior three-bar high and the latest five-bar average.",
  exit:"Calculate price levels for a long position using a stop and a reward-to-risk multiple.",
  simulation:"Sample observed intraday returns with replacement to generate 10,000 possible price paths.",
  risk:"Review how much of your paper equity is invested and where exposure is concentrated.",
  budget:"Size a long position using available cash, a stop price and a percentage of account equity.",
  broker:"Review a whole-share market order on the desk. Confirmed orders execute at the next bar’s open.",
  alerts:"Set a one-time threshold. The alert fires when a new replay bar closes at or beyond it.",
  earnings:"Compare fiscal results published before the replay date. Open a release for its financial statements.",
  congress:"Explore selected spouse transactions in Nancy Pelosi’s January 2025 House disclosure."
};
function field(id,label,value,step="0.01",min="0.01") {
  return `<label class="field">${label}<input id="${id}" name="${id}" type="number" min="${min}" step="${step}" required value="${value}"></label>`;
}
function source(url, label) { return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`; }
const button = (action,label) => `<button class="primary" data-action="${action}">${label}</button>`;
const toolOutput = '<div id="tool-output" aria-live="polite"></div>';

export function toolsView(state) {
  const {market,a,symbol,tool} = state;
  const index = a.index, today = dayOf(market.times[index]);
  const q = snapshot(market,symbol,index), bars = market.series[symbol], close = q.last.c;
  const net = equity(a,market), title = toolList[tool], record = (head,line,url,label) => `<article class="record"><b>${esc(head)}</b><small>${esc(line)}</small>${source(url,label)}</article>`;
  const nav = Object.entries(toolList).map(([id,name]) => `<button data-tool="${id}" aria-current="${id===tool}">${name}</button>`).join("");
  let body = "";
  switch (tool) {
    case "scanner": {
      const ranked = symbolsOf(market).map(s => ({s,...snapshot(market,s,index)})).sort((x,y) => y.changePct - x.changePct);
      body = table(["Ticker","Last close","Session move","Volume"], ranked.map(row => [
        `<button class="bare" data-chart="${esc(row.s)}">${esc(row.s)}</button>`,usd(row.last.c),
        `<span class="${row.change>=0?"up":"down"}">${percent(row.changePct)}</span>`,row.volume.toLocaleString("en-US")]));
      break;
    }
    case "entry": {
      const recent = q.bars.slice(-5);
      if (recent.length < 5 || q.vwap === null) {body = '<p class="empty">Five bars and positive session volume are needed for this check.</p>';break;}
      const previous = recent.slice(-4,-1);
      const high = Math.max(...previous.map(b=>b.h));
      const average = recent.reduce((n,b)=>n+b.c,0) / recent.length;
      body = stats([["Last close",usd(close)],["Prior 3-bar high",usd(high)],["5-bar average",usd(average)],["Session VWAP",usd(q.vwap)]]) +
        `<p class="inline-note">${close>high && close>average && close>q.vwap ? "Breakout condition met at this close." : "Breakout condition has not been met at this close."}</p><p class="hint">The close must exceed all three reference prices.</p>`;
      break;
    }
    case "exit":
    case "budget": {
      const isExit = tool === "exit";
      const stop = (Math.max(1,Math.min(close-1,Math.round(close*.985)))/100).toFixed(2);
      body = `<form id="plan-form"><div class="fields">${field("entry-price","Entry price (USD)",(close/100).toFixed(2))}${field("stop-price","Stop price (USD)",stop)}${isExit?field("multiple","Reward / risk",2,"0.1","0.1"):field("risk-percent","Equity at risk (%)",1,"0.1","0.1")}</div><button class="primary">${isExit?"Calculate target":"Calculate size"}</button></form>` + toolOutput;
      break;
    }
    case "simulation":
      body = `<form id="scenario-form"><div class="fields">${field("horizon","Future bars",12,1,1)}</div><button class="primary">Run 10,000 paths</button></form>` + toolOutput;
      break;
    case "risk": {
      const positions = Object.entries(a.positions).map(([s,p]) => ({s,value:p.quantity * market.series[s][index].c})).sort((x,y)=>y.value-x.value);
      body = stats([["Invested",((net-a.cash)/net*100).toFixed(1)+"%"],["Largest position",positions.length?positions[0].s:"None"],["Cash available",usd(availableCash(a))],["Account return",percent((net/STARTING_CASH-1)*100)]]) +
        (positions.length ? table(["Ticker","Market value","Equity weight"],positions.map(p=>[esc(p.s),usd(p.value),(p.value/net*100).toFixed(1)+"%"])) : '<p class="empty">Your account is entirely in cash.</p>');
      break;
    }
    case "broker":
      body = stats([["Buying power",usd(availableCash(a))],["Open orders",a.orders.filter(o=>o.status==="pending").length],["Owned shares",a.positions[symbol]?.quantity ?? 0]]) + button("desk","Open order ticket");
      break;
    case "alerts":
      body = `<form id="alert-form"><div class="fields"><label class="field">Trigger on close<select name="direction"><option value="above">At or above</option><option value="below">At or below</option></select></label>${field("level","Price (USD)",(Math.ceil(close*1.005)/100).toFixed(2))}</div><button class="primary">Create alert</button></form>` +
        (a.alerts.length ? table(["Ticker","Condition","Status",""],a.alerts.slice().reverse().map(al=>[
          esc(al.symbol),esc(al.direction)+" "+usd(al.level),al.triggered===null?"Armed":esc(timeOf(market.times[al.triggered])+" ET · "+dateOf(market.times[al.triggered])),
          `<button class="bare" data-remove-alert="${esc(al.id)}">Remove</button>`])):'<p class="hint">No price alerts set.</p>');
      break;
    case "news":
    case "earnings":
    case "congress": {
      const records = tool==="news"?headlines:tool==="earnings"?earnings:disclosures;
      const tickers = [...new Set(records.map(r=>r.symbol))];
      body = `<label class="field">Archive ticker<select id="archive-filter"><option value="all">All tickers</option>${tickerOptions(tickers,state.filter,false)}</select></label>`;
      const subset = records.filter(r=>(state.filter==="all"||state.filter===r.symbol) && (tool==="congress"?filingDate:r.date)<today);
      if (tool==="news") body += `<div class="records">${subset.map(r=>record(r.title,r.symbol+" · "+r.date+" · "+r.publisher,r.url,"Read announcement")).join("")}</div>`;
      if (tool==="earnings") body += subset.length ? table(["Ticker / period","Revenue","Year over year","Diluted EPS","Release"],subset.map(r=>[esc(r.symbol+" · "+r.quarter),esc(r.revenue),esc(r.growth),esc(r.eps),source(r.url,r.date)])) : "";
      if (tool==="congress") {
        body += subset.length ? table(["Ticker","Asset","Transaction","Trade date","Reported range"],subset.map(r=>[esc(r.symbol),esc(r.asset),esc(r.side),esc(r.date),esc(r.amount)])) : "";
        body += `<div class="records"><p class="hint">Filing signed 17 Jan 2025. Amounts are disclosed ranges. The transactions shown belong to the filer’s spouse.</p>${source(houseReport,"Open original House filing")}${source("https://disclosures-clerk.house.gov/FinancialDisclosure","Search the House disclosure archive")}</div>`;
      }
      if (!subset.length) body += '<p class="empty">No archived records match this ticker and replay date.</p>';
      break;
    }
  }
  const needsTicker = ["entry","exit","budget","broker","alerts","simulation"].includes(tool);
  return `<div class="tool-layout"><nav class="tool-nav panel" aria-label="Research tools">${nav}</nav><section class="panel tool-body"><div class="panel-head"><h2>${title}</h2>${needsTicker?`<select id="tool-symbol" aria-label="Research ticker">${tickerOptions(symbolsOf(market),symbol,false)}</select>`:""}</div><div class="panel-body"><p class="hint">${hints[tool]}</p>${body}</div></section></div>`;
}

export function calculateTool(state, form) {
  const data = new FormData(form), get = k => Number(data.get(k));
  const {market,a,symbol,tool} = state;
  if (tool==="simulation") {
    const r=simulation(market,symbol,a.index,get("horizon"));
    return stats([["10th percentile",usd(r.low)],["Median",usd(r.median)],["90th percentile",usd(r.high)],["Above last close",r.above.toFixed(1)+"%"]]) +
      `<p class="hint">10,000 paths sampled from ${r.observations} observed bar returns. Percentiles describe this replay model.</p>`;
  }
  const entry=dollarsToCents(get("entry-price")), stop=dollarsToCents(get("stop-price"));
  if (![entry,stop].every(Number.isSafeInteger) || stop<=0 || stop>=entry || entry>100000000) throw Error("Enter a valid entry and a positive stop below it.");
  if (tool==="exit") {
    const multiple=get("multiple"), risk=entry-stop;
    if (!Number.isFinite(multiple) || multiple<=0 || multiple>100) throw Error("Use a reward-to-risk multiple above 0 and up to 100.");
    return stats([["Stop",usd(stop)],["Price risk / share",usd(risk)],["Target",usd(entry+risk*multiple)]]) +
      '<p class="hint">These planned levels are recorded as a calculation. Use the paper broker to submit an order.</p>';
  }
  const size = sizePosition(availableCash(a),equity(a,market),entry,stop,get("risk-percent"));
  return stats([["Whole shares",size.quantity],["Risk budget",usd(size.riskBudget)],["Modelled loss at stop",usd(size.plannedLoss)]]) +
    '<p class="hint">Includes both fill fees and modelled slippage. A gap through the stop can increase the loss.</p>';
}

