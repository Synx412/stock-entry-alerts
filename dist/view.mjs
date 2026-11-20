import {usd,percent,dateOf,timeOf,nameOf,symbolsOf,snapshot} from "./market.mjs";
import {availableCash,equity,STARTING_CASH,EXECUTION_FEE,fillPrice} from "./broker.mjs";

export const esc = value => String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const stats = pairs => `<div class="tool-stats">${pairs.map(([k,v])=>`<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("")}</div>`;
export const table = (head,rows) => `<div class="table-wrap"><table><thead><tr>${head.map(t=>`<th scope="col">${esc(t)}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
export const tickerOptions = (symbols,chosen,includeNames=true) => symbols.map(s=>`<option value="${esc(s)}" ${s===chosen?"selected":""}>${esc(includeNames && nameOf(s)!==s?s+" · "+nameOf(s):s)}</option>`).join("");
const positive = value => value < 0 ? "down" : value > 0 ? "up" : "";
const signed = value => (value > 0 ? "+" : "") + usd(value);
const secHead = (title,extra="")=>`<div class="panel-head"><h2>${esc(title)}</h2>${extra}</div>`;

export function summary({market,a}) {
  const net = equity(a,market), change = net-STARTING_CASH;
  return [["Account equity",usd(net),""],["Buying power",usd(availableCash(a)),""],["Market value",usd(net-a.cash),""],["Total P&L",signed(change),positive(change)]].map(([label,value,color])=>`<div><small>${label}</small><strong class="${color}">${value}</strong></div>`).join("");
}

function spark(bars) {
  const recent = bars.slice(-25), values=recent.map(b=>b.c);
  const lo=Math.min(...values), span=Math.max(1,Math.max(...values)-lo);
  const points=values.map((p,i)=>(1+i*54/Math.max(1,values.length-1)).toFixed(1)+","+(20-17*(p-lo)/span).toFixed(1)).join(" ");
  return `<svg class="spark" aria-hidden="true" viewBox="0 0 56 23"><polyline points="${points}" fill="none" stroke="${values.at(-1)>=values[0]?"#397659":"#ae624e"}" stroke-width="1.65" stroke-linejoin="round"/></svg>`;
}
function watchlist(state) {
  const {a,market,symbol} = state;
  const rows=symbolsOf(market).map(s=>{
    const q=snapshot(market,s,a.index);
    return `<button class="ticker-row ${s===symbol?"active":""}" data-chart="${esc(s)}" aria-pressed="${s===symbol}">
      <span><b>${esc(s)}</b><small>${esc(nameOf(s))}</small></span>${spark(q.bars)}<span class="ticker-price"><b>${usd(q.last.c)}</b><i class="${positive(q.change)}">${percent(q.changePct)}</i></span></button>`;
  });
  return `<section class="panel watch">${secHead("Watchlist",`<span class="small">${rows.length} equities</span>`)}<div class="ticker-list">${rows.join("")}</div></section>`;
}
function activity({a,market},limit=Infinity) {
  const rows=a.orders.slice().reverse().slice(0,limit);
  if (!rows.length) return '<p class="activity-empty empty">Your paper orders will appear here after you confirm a ticket.</p>';
  return table(["Order","Shares","Fill price","Replay time","Status",""],rows.map(o=>{
    const time=market.times[o.closed??o.placed];
    return [`<b>${esc(o.symbol)}</b> · ${o.side==="buy"?"Buy":"Sell"}`,o.quantity,o.price?usd(o.price):"—",esc(dateOf(time)+" · "+timeOf(time)),
      `<span class="pill ${esc(o.status)}">${esc(o.status)}</span>${o.reason?`<br><small>${esc(o.reason)}</small>`:""}`,
      o.status==="pending"?`<button class="bare" data-cancel="${esc(o.id)}">Cancel</button>`:""];
  }));
}
export function estimate({a,market,symbol,side,quantity}) {
  const valid = Number.isSafeInteger(Number(quantity)) && Number(quantity)>=1 && Number(quantity)<=1000000;
  const price = fillPrice(market.series[symbol][a.index].c,side);
  return `<div><span>Estimated fill</span><strong>${usd(price)}</strong></div><div><span>Execution fee</span><strong>${usd(EXECUTION_FEE)}</strong></div><div><span>Estimated ${side==="buy"?"debit":"credit"}</span><strong>${valid?usd(price*Number(quantity)+(side==="buy"?EXECUTION_FEE:-EXECUTION_FEE)):"—"}</strong></div>`;
}
function ticket(state) {
  const {a,market,symbol,side,quantity}=state;
  return `<section class="panel ticket">${secHead("Order ticket",'<span class="tag">Paper</span>')}
    <div class="panel-body"><div class="side" role="group" aria-label="Order side">${["buy","sell"].map(s=>`<button class="${s}" data-side="${s}" aria-pressed="${s===side}">${s==="buy"?"Buy":"Sell"}</button>`).join("")}</div>
    <form id="order-form"><label class="field">Ticker<select id="ticket-symbol">${tickerOptions(symbolsOf(market),symbol)}</select></label><label class="field">Quantity (shares)<input id="quantity" type="number" inputmode="numeric" min="1" max="1000000" step="1" value="${esc(quantity)}" required></label>
    <div class="detail-list" id="estimate">${estimate(state)}</div><button class="primary block" ${a.index===market.times.length-1?"disabled":""}>Review paper order</button><p class="hint">Market orders fill at the next bar’s open.</p></form></div></section>`;
}
function chart(state) {
  const {market,a,symbol,chartType} = state, q=snapshot(market,symbol,a.index);
  const facts=[["Session open",usd(q.open)],["High",usd(q.high)],["Low",usd(q.low)],["Volume",Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(q.volume)]];
  const note = "Price (USD) · volume · "+timeOf(market.times[a.index])+" ET";
  return `<section class="panel chart-panel"><div class="panel-head"><div class="instrument"><span class="symbol-mark" aria-hidden="true">${esc(symbol[0])}</span><div><b>${esc(symbol)}</b><small>${esc(nameOf(symbol))}</small></div></div><label><select id="chart-window" aria-label="Chart time window"><option value="session" ${state.window==="session"?"selected":""}>This session</option><option value="20" ${state.window==="20"?"selected":""}>Last 20 bars</option><option value="60" ${state.window==="60"?"selected":""}>Last 60 bars</option></select></label></div>
  <div class="chart-top"><div><div class="quote-big">${usd(q.last.c)}</div><p class="move ${positive(q.change)}">${signed(q.change)} (${percent(q.changePct)}) <span class="small">this session</span></p></div><div class="seg" role="group" aria-label="Chart style">${["Candles","Line"].map(t=>`<button data-chart-type="${t}" aria-pressed="${t===chartType}">${t}</button>`).join("")}</div></div>
  <div class="chart-wrap"><svg id="price-chart" role="img"></svg></div><p class="chart-note" id="chart-note" data-default="${esc(note)}">${esc(note)}</p><div class="quote-facts">${facts.map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join("")}</div></section>`;
}
export const deskView = state => `<div class="desk-grid"><div class="left-col">${chart(state)}<section class="panel recent">${secHead("Recent orders",'<button class="bare" data-action="portfolio">View portfolio</button>')}${activity(state,4)}</section></div><div class="right-col">${ticket(state)}${watchlist(state)}</div></div>`;
export function portfolioView(state) {
  const {a,market}=state, net=equity(a,market);
  const positions=Object.entries(a.positions).map(([s,p])=>{
    const price=market.series[s][a.index].c, value=price*p.quantity, pl=value-p.cost;
    return [`<button class="bare" data-chart="${esc(s)}">${esc(s)}</button>`,p.quantity,usd(p.cost/p.quantity),usd(price),usd(value),`<span class="${positive(pl)}">${signed(pl)}</span>`];
  });
  const unrealized=net-STARTING_CASH-a.realized;
  return `<div class="stack"><section class="panel">${secHead("Positions",`<span class="small">${positions.length} open</span>`)}
  ${positions.length?table(["Ticker","Shares","Average cost","Last close","Market value","Unrealized P&L"],positions):'<div class="panel-body"><p class="empty">Your portfolio is in cash. Buy shares on the trade desk, then advance the replay to fill the order.</p></div>'}</section>
  <section class="panel">${secHead("Account breakdown")}<div class="panel-body">${stats([["Settled cash",usd(a.cash)],["Realized P&L",signed(a.realized)],["Unrealized P&L",signed(unrealized)],["Paid fees",usd(a.orders.reduce((n,o)=>n+(o.fee||0),0))]])}</div></section>
  <section class="panel">${secHead("Order history",`<button data-action="export" ${!a.orders.length?"disabled":""}>Export CSV</button>`)}${activity(state)}</section></div>`;
}

