import {usd,timeOf,dateOf,sessionStart,symbolsOf,parseBarsCSV,dollarsToCents} from "./market.mjs";
import {advance,orderQuote,submitOrder,cancelOrder,placeAlert} from "./broker.mjs";
import {connectDesk,marketOf,freshSession} from "./session.mjs";
import {summary,esc,deskView,estimate,portfolioView} from "./view.mjs";
import {toolsView,calculateTool,toolList} from "./research.mjs";
import {drawChart} from "./chart.mjs";

const $ = selector => document.querySelector(selector);
const state = {symbol:"AAPL",side:"buy",quantity:"10",chartType:"Candles",window:"session",filter:"all"};
const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("eleven-desk-updates") : null;
const dialog = $("#action-dialog"), body = $("#dialog-body");
let db, ticket, imported, noticeTimer, observer, busy = false, generation = 0;
const pages = {desk:"Trade desk",portfolio:"Portfolio",tools:"Research tools"};

function notice(message,bad=false) {
  clearTimeout(noticeTimer);
  const node=$("#notice");
  node.textContent=message; node.classList.toggle("bad",bad);
  noticeTimer=setTimeout(()=>{node.textContent="";},5500);
}
function setSession(s) {
  state.session=s; state.market=marketOf(s); state.a=s.account;
  if (!Object.hasOwn(state.market.series,state.symbol)) state.symbol=symbolsOf(state.market)[0];
}
function route() {
  const [page,tool] = location.hash.slice(1).split("/");
  state.page=Object.hasOwn(pages,page)?page:"desk";
  state.tool=Object.hasOwn(toolList,tool)?tool:"scanner";
}
function paintChart() {
  const svg=$("#price-chart");
  if (!svg) return;
  const {market,a,symbol}=state;
  const start=state.window==="session"?sessionStart(market.times,a.index):Math.max(0,a.index+1-Number(state.window));
  drawChart(svg,market.series[symbol].slice(start,a.index+1),market.times.slice(start,a.index+1),state.chartType,symbol,$("#chart-note"));
}
function render() {
  route();
  $("#page-title").textContent=pages[state.page];
  document.title=pages[state.page]+" · Eleven Desk";
  document.querySelectorAll("[data-page]").forEach(n=>{if(n.dataset.page===state.page)n.setAttribute("aria-current","page");else n.removeAttribute("aria-current");});
  const {a,market} = state, time=market.times[a.index];
  $("#replay-time").textContent=dateOf(time)+" · "+timeOf(time)+" ET";
  $("#feed-label").textContent=market.label;
  const next=$("#next-bar");
  next.disabled=a.index>=market.times.length-1; next.textContent=next.disabled?"Replay ended":"Next bar";
  $("#account-strip").innerHTML=summary(state);
  observer?.disconnect();
  $("#content").innerHTML=state.page==="desk"?deskView(state):state.page==="portfolio"?portfolioView(state):toolsView(state);
  if ($("#price-chart")) {
    paintChart();
    observer = new ResizeObserver(paintChart);
    observer.observe($("#price-chart").parentElement);
  }
  if(state.page==="tools") $(".tool-nav [aria-current=true]")?.scrollIntoView?.({block:"nearest",inline:"nearest",behavior:"instant",container:"nearest"});
}
function goto(page) {
  if (location.hash==="#"+page) render();
  else location.hash=page;
}
function openDialog(title,html) {
  $("#modal-title").textContent=title;body.innerHTML=html+'<p id="modal-error" class="error" role="alert"></p>';
  if (!dialog.open) dialog.showModal();
}
function errorMessage(err) {
  const message=err instanceof Error ? err.message : "The action could not be completed.";
  if (dialog.open && $("#modal-error")) $("#modal-error").textContent=message;
  else notice(message,true);
}
async function refresh() {
  if (!db) return;
  const request=++generation,session=await db.read();
  if (request===generation) {setSession(session);render();}
}
async function mutate(action) {
  if (busy) return false;
  busy=true; const request=++generation;
  try {
    const session=await db.write(action);
    if (request===generation) {setSession(session);render();} else await refresh();
    channel?.postMessage("saved");
    return true;
  } finally {busy=false;}
}
function checkTape(s,id,index) {
  if (s.id!==id || (index!==undefined && s.account.index!==index)) throw Error("The replay changed in another tab. Close this dialog and review the action again.");
}
function review() {
  const {a,market,symbol,side}=state,quantity=Number(state.quantity);
  const quote=orderQuote(a,market,symbol,side,quantity);
  ticket={id:crypto.randomUUID(),sessionId:state.session.id,index:a.index,symbol,side,quantity};
  const verb=side==="buy"?"Buy":"Sell";
  openDialog("Review paper order",`<p><b>${verb} ${quantity} ${esc(symbol)} ${quantity===1?"share":"shares"}</b></p>
  <div class="detail-list"><div><span>Order type</span><strong>Market · next bar</strong></div><div><span>Estimated fill / share</span><strong>${usd(quote.price)}</strong></div><div><span>Fee per fill</span><strong>$1.00</strong></div><div><span>Estimated ${side==="buy"?"debit":"credit"}</span><strong>${usd(quote.total)}</strong></div></div>
  <p class="hint">The replay applies 0.05% slippage at the next opening price. A gap can change the fill.</p><div class="dialog-actions"><button data-action="close">Back</button><button class="primary" data-action="confirm">Confirm paper order</button></div>`);
}
function dataDialog() {
  const {market,a}=state; imported=null;
  openDialog("Market data",`<p><b>${esc(market.label)}</b></p><p class="hint">Bar ${a.index+1} of ${market.times.length} · ${symbolsOf(market).length} tickers</p>
  <div class="data-section"><h3>Import an OHLCV replay</h3><p class="hint">Use a CSV with timestamp, symbol, open, high, low, close and volume. Timestamps are bar closes with an explicit time zone.</p>
  <label class="field">Price data file<input id="pick-csv" type="file" accept=".csv,text/csv"></label><p class="small" id="file-info"></p><button data-action="use-import" disabled>Start imported replay</button></div>
  <div class="data-section"><h3>Sample market</h3><p class="hint">Six US equities, five simulated sessions and five-minute bars. A fresh account starts with $100,000.</p><div class="form-actions"><button data-action="demo-reset">Restart sample replay</button><button class="bare" data-action="sample-csv">Download CSV example</button></div></div>`);
}
function confirmReset(custom) {
  if (custom && !imported) throw Error("Choose a valid CSV first.");
  const id=state.session.id,index=state.a.index;
  const replacement = custom ? imported : null;
  const label=replacement?replacement.label:"Synthetic replay";
  openDialog("Start a fresh paper account?",`<p>Starting <b>${esc(label)}</b> resets cash, positions, orders and alerts on this browser. You can export your current orders from Portfolio first.</p><div class="dialog-actions"><button data-action="data">Back</button><button id="reset-confirm" class="primary">Start fresh</button></div>`);
  $("#reset-confirm").addEventListener("click",async()=>{
    try {const ok=await mutate(s=>{checkTape(s,id,index);return freshSession(replacement);});if(ok){dialog.close();state.quantity="10";goto("desk");notice("Fresh paper account started.");}} catch(err){errorMessage(err);}
  });
}
function download(name,content) {
  const a=document.createElement("a"),url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
  a.href=url; a.download=name; document.body.append(a); a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function exportOrders() {
  const {a,market}=state,cols=["order_id","symbol","side","shares","status","placed_at","closed_at","fill_usd","fee_usd","reason"];
  const rows=a.orders.map(o=>[o.id,o.symbol,o.side,o.quantity,o.status,new Date(market.times[o.placed]).toISOString(),o.closed==null?"":new Date(market.times[o.closed]).toISOString(),o.price==null?"":(o.price/100).toFixed(2),o.fee==null?"":(o.fee/100).toFixed(2),o.reason||""]);
  download("eleven-desk-orders.csv",[cols,...rows].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\r\n")+"\r\n");
}
function exampleCSV() {
  const {market}=state,symbol=symbolsOf(market)[0],bars=market.series[symbol].slice(0,Math.min(state.a.index+1,36));
  if (bars.length < 2) {notice("Advance a bar to export two example rows.",true);return;}
  const rows=bars.map((b,i)=>[new Date(market.times[i]).toISOString(),symbol,...[b.o,b.h,b.l,b.c].map(v=>(v/100).toFixed(2)),b.v].join(","));
  download("eleven-desk-bars.csv",["timestamp,symbol,open,high,low,close,volume",...rows].join("\r\n")+"\r\n");
}
async function handleClick(e) {
  const el=e.target.closest("button");if (!el || el.disabled || !state.a) return;
  const d=el.dataset;
  if (el.id==="next-bar") {
    const {market,a}=state, sessionId=state.session.id, filled=a.orders.filter(o=>o.status==="pending").length, alertCount=a.alerts.filter(x=>x.triggered!==null).length;
    const ok=await mutate(s=>{checkTape(s,sessionId,a.index);advance(s.account,marketOf(s));});
    if(ok) {
      const changed=state.a.orders.filter(o=>o.closed===state.a.index);
      const triggered=state.a.alerts.filter(x=>x.triggered!==null).length-alertCount;
      if(filled||triggered) notice([changed.length?changed.map(o=>o.symbol+" "+o.status).join(", "):"",triggered?triggered+" price alert"+(triggered===1?"":"s")+" triggered":""].filter(Boolean).join(" · "));
    }
    return;
  }
  if (d.chart) {state.symbol=d.chart;goto("desk");return;}
  if (d.chartType) {state.chartType=d.chartType;render();return;}
  if (d.side) {state.side=d.side;render();return;}
  if (d.tool) {state.filter="all";goto("tools/"+d.tool);return;}
  if (d.cancel || d.removeAlert) {
    const sessionId=state.session.id;
    await mutate(s=>{checkTape(s,sessionId);if(d.cancel)cancelOrder(s.account,d.cancel);else s.account.alerts=s.account.alerts.filter(al=>al.id!==d.removeAlert);});
    return;
  }
  switch (el.id==="data-open"?"data":el.id==="close-dialog"?"close":d.action) {
    case "data": dataDialog();break;
    case "close": dialog.close();break;
    case "desk": case "portfolio": goto(d.action);break;
    case "export": exportOrders();break;
    case "sample-csv": exampleCSV();break;
    case "demo-reset": confirmReset(false);break;
    case "use-import": confirmReset(true);break;
    case "confirm": {
      const current=ticket;if (!current) return;
      const ok=await mutate(s=>{checkTape(s,current.sessionId);submitOrder(s.account,marketOf(s),current);});
      if(ok){ticket=null;dialog.close();notice("Paper order queued. Advance one bar to see the fill.");}
    }
  }
}
document.addEventListener("click", e=>handleClick(e).catch(errorMessage));
document.addEventListener("submit",async e=>{
  e.preventDefault();const form=e.target;
  try {
    if (form.id==="order-form") {review();return;}
    if (form.id==="alert-form") {
      const data=new FormData(form),{a,symbol}=state,sessionId=state.session.id;
      const alert={id:crypto.randomUUID(),symbol,level:dollarsToCents(data.get("level")),direction:data.get("direction")};
      if(await mutate(s=>{checkTape(s,sessionId,a.index);placeAlert(s.account,marketOf(s),alert);})) notice("Price alert armed for "+symbol+".");
    } else if (["plan-form","scenario-form"].includes(form.id)) {
      $("#tool-output").innerHTML=calculateTool(state,form);
    }
  } catch(err){if($("#tool-output"))$("#tool-output").innerHTML="";errorMessage(err);}
});
document.addEventListener("input",e=>{
  if(e.target.id==="quantity"){state.quantity=e.target.value;$("#estimate").innerHTML=estimate(state);}
});
document.addEventListener("change",async e=>{
  const el=e.target;
  try {
    if(el.id==="pick-csv") {
      imported=null;const btn=body.querySelector("[data-action=use-import]");btn.disabled=true;$("#file-info").textContent="";$("#modal-error").textContent="";
      const file=el.files[0];if(!file)return;
      if(file.size>2*1024*1024)throw Error("Choose a CSV smaller than 2 MiB.");
      const parsed=parseBarsCSV(await file.text(),file.name);
      if(!el.isConnected || el.files[0]!==file)return;
      imported=parsed;$("#file-info").textContent=parsed.times.length+" bars per ticker · "+symbolsOf(parsed).join(", ");btn.disabled=false;return;
    }
    if(el.id==="ticket-symbol"||el.id==="tool-symbol")state.symbol=el.value;
    else if(el.id==="chart-window")state.window=el.value;
    else if(el.id==="archive-filter")state.filter=el.value;
    else return;
    render();
  }catch(err){errorMessage(err);}
});
dialog.addEventListener("close",()=>{ticket=null;});
window.addEventListener("hashchange",()=>{if(state.a)render();});
channel?.addEventListener("message",()=>refresh().catch(errorMessage));
document.addEventListener("visibilitychange",()=>{if(!document.hidden) refresh().catch(errorMessage);});
try {
  db=await connectDesk(); setSession(await db.initialize()); render();
} catch(err) {
  $("#content").innerHTML=`<p class="error" role="alert">${esc(err.message)}</p>`;
  $("#data-open").disabled=true;$("#replay-time").textContent="Storage unavailable";
}

