import test from "node:test";
import assert from "node:assert/strict";
import {demoMarket,parseBarsCSV,simulation,snapshot} from "../dist/market.mjs";
import {newAccount,submitOrder,advance,availableCash,equity,cancelOrder,placeAlert,orderQuote,sizePosition,fillPrice,STARTING_CASH} from "../dist/broker.mjs";
import {toolsView,toolList} from "../dist/research.mjs";

const header="timestamp,symbol,open,high,low,close,volume";
const csv = [header,"2025-09-22T14:05:00Z,TEST,10,11,9,10,500","2025-09-22T14:10:00Z,TEST,12,13,11,12.50,600","2025-09-22T14:15:00Z,TEST,13,14,12,13.50,700","2025-09-22T14:20:00Z,TEST,14,15,13,14.50,800"].join("\n");
const tape=()=>({...parseBarsCSV(csv),start:0});
const queue=(a,m,side,quantity,id="order1")=>submitOrder(a,m,{id,symbol:"TEST",index:a.index,side,quantity});

test("a ticket reserves cash, fills once on the next open and includes both costs",()=>{
  const m=tape(),a=newAccount(m);
  queue(a,m,"buy",3);queue(a,m,"buy",3);
  assert.equal(a.orders.length,1);
  assert.equal(a.cash,STARTING_CASH);
  assert.equal(availableCash(a),STARTING_CASH-3*fillPrice(1000,"buy")-100);
  advance(a,m);
  const cost=3*fillPrice(1200,"buy")+100;
  assert.equal(a.orders[0].price,1201);
  assert.deepEqual(a.positions.TEST,{quantity:3,cost});
  assert.equal(a.cash,STARTING_CASH-cost);
  assert.equal(equity(a,m),a.cash+3*1250);
});
test("partial and final sales reconcile rounded cost basis, cash and realized P&L",()=>{
  const m=tape(),a=newAccount(m);
  queue(a,m,"buy",3);advance(a,m);
  queue(a,m,"sell",1,"s1");advance(a,m);
  assert.equal(a.positions.TEST.quantity,2);
  assert.throws(()=>queue(a,m,"sell",3,"invalid"));
  queue(a,m,"sell",2,"s2");advance(a,m);
  assert.deepEqual(a.positions,{});
  assert.equal(a.realized,a.cash-STARTING_CASH);
  assert.equal(a.cash,STARTING_CASH-3*1201-100+1299-100+2*1399-100);
});
test("validation covers funds, reserves, short sales, quantity and replay end",()=>{
  const m=tape(),a=newAccount(m);a.cash=4000;
  assert.throws(()=>queue(a,m,"sell",1));assert.throws(()=>queue(a,m,"buy",4));assert.throws(()=>queue(a,m,"buy",.5));
  queue(a,m,"buy",3);assert.throws(()=>queue(a,m,"buy",1,"b2"));
  cancelOrder(a,"order1");assert.equal(availableCash(a),4000);
  advance(a,m);assert.deepEqual(a.positions,{});
  assert.throws(()=>submitOrder(a,m,{id:"stale",symbol:"TEST",side:"buy",quantity:1,index:0}));
  a.index=m.times.length-1;assert.throws(()=>advance(a,m));assert.throws(()=>orderQuote(a,m,"TEST","buy",1));
});
test("opening gaps reject unaffordable orders without a fee or negative balance",()=>{
  const m=tape(),a=newAccount(m);a.cash=1110;queue(a,m,"buy",1);advance(a,m);
  assert.equal(a.orders[0].status,"rejected");assert.equal(a.cash,1110);assert.deepEqual(a.positions,{});
});
test("pending sells reserve shares, alerts trigger once and never on hidden bars",()=>{
  const m=tape(),a=newAccount(m);
  placeAlert(a,m,{symbol:"TEST",id:"alert",direction:"above",level:1200});
  assert.equal(a.alerts[0].triggered,null);
  queue(a,m,"buy",2);advance(a,m);assert.equal(a.alerts[0].triggered,1);
  queue(a,m,"sell",2,"s");assert.throws(()=>queue(a,m,"sell",1,"s2"));advance(a,m);
  assert.equal(a.alerts[0].triggered,1);
});
test("OHLCV import sorts times, normalizes tickers, and preserves gaps",()=>{
  const lines=csv.split("\n");const m=parseBarsCSV([lines[0],...lines.slice(1).reverse()].join("\r\n").replaceAll("TEST","test"));
  assert.equal(m.series.TEST[0].o,1000);assert.equal(m.times.length,4);
  assert.throws(()=>parseBarsCSV(csv+"\n"+lines[1]));assert.throws(()=>parseBarsCSV(csv.replace("T14:05:00Z","T14:05:00")));
  assert.throws(()=>parseBarsCSV(csv.replace("10,11,9,10","10,8,9,10")));
  assert.throws(()=>parseBarsCSV(csv.replace("10,11,9,10","10,11,,10")));
  assert.throws(()=>parseBarsCSV(csv.replace("TEST","OTHER")));
});
test("daily snapshots and bootstrap paths cannot see future returns",()=>{
  const m=demoMarket(),i=35;const expected=snapshot(m,"AAPL",i);
  const forecast=simulation(m,"AAPL",i,12);const changed=structuredClone(m);
  changed.series.AAPL[i+1].c=10000000;
  assert.deepEqual(snapshot(changed,"AAPL",i),expected);assert.deepEqual(simulation(changed,"AAPL",i,12),forecast);
  assert.ok(forecast.low<=forecast.median && forecast.median<=forecast.high);
  assert.equal(snapshot(m,"AAPL",78).bars.length,1);assert.throws(()=>simulation(m,"AAPL",1,12));
});
test("sizing respects available cash, cent rounding, slippage and both fees",()=>{
  const s=sizePosition(5000,100000,1000,900,1);
  assert.ok(s.quantity*fillPrice(1000,"buy")+100<=5000);
  assert.ok(s.plannedLoss<=s.riskBudget);assert.equal(sizePosition(0,100000,1000,900,1).quantity,0);
  assert.throws(()=>sizePosition(5000,100000,1000,1000,1));
});
test("all eleven research views render, archive records respect the replay date",()=>{
  const market=demoMarket(),a=newAccount(market);
  assert.equal(Object.keys(toolList).length,11);
  for (const tool of Object.keys(toolList)) {
    const html=toolsView({market,a,symbol:"AAPL",tool,filter:"all"});
    assert.ok(html.includes('<h2>'+toolList[tool]+'</h2>'));
  }
  market.times=market.times.map(t=>t-366*86400000);
  const news=toolsView({market,a,symbol:"AAPL",tool:"news",filter:"all"});
  assert.ok(!news.includes("Apple announces iPhone 17"));
});
