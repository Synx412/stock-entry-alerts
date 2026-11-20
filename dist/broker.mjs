export const STARTING_CASH = 10000000;
export const SLIPPAGE_BP = 5;
export const EXECUTION_FEE = 100;
export const fillPrice = (price, side) => Math.max(1,Math.round(price * (1 + (side === "buy" ? 1 : -1) * SLIPPAGE_BP / 10000)));

export function newAccount(market) {
  return {index:market.start, cash:STARTING_CASH, realized:0, positions:{}, orders:[], alerts:[]};
}

export function equity(account, market) {
  return account.cash + Object.entries(account.positions).reduce((total,[symbol, pos]) => total + pos.quantity * market.series[symbol][account.index].c,0);
}

export function availableCash(a) {
  return a.cash - a.orders.filter(o => o.status === "pending" && o.side === "buy").reduce((sum,o) => sum + o.reserve,0);
}

export function orderQuote(a, market, symbol, side, quantity) {
  if (!Object.hasOwn(market.series,symbol) || !["buy","sell"].includes(side)) throw Error("Choose an available ticker and order side.");
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw Error("Enter 1–1,000,000 whole shares.");
  if (a.index >= market.times.length - 1) throw Error("The replay has ended. Open Market data to start another session.");
  const price = fillPrice(market.series[symbol][a.index].c, side);
  const gross = price * quantity;
  if (side === "buy" && gross + EXECUTION_FEE > availableCash(a)) throw Error("Available cash is too low for this order.");
  if (side === "sell") {
    const pending = a.orders.filter(o => o.status === "pending" && o.symbol === symbol && o.side === "sell").reduce((sum,o) => sum + o.quantity,0);
    if (quantity > (a.positions[symbol]?.quantity ?? 0) - pending) throw Error("Sell quantity exceeds your available shares.");
    if (gross <= EXECUTION_FEE) throw Error("Sale proceeds must cover the $1.00 fee.");
  }
  return {price, total:gross + (side === "buy" ? EXECUTION_FEE : -EXECUTION_FEE)};
}

export function submitOrder(a, market, ticket) {
  if (a.orders.some(o => o.id === ticket.id)) return;
  if (ticket.index !== a.index) throw Error("Prices have advanced. Review the ticket again.");
  if (!ticket.id) throw Error("Missing ticket ID.");
  const {symbol,side,quantity,id} = ticket;
  const q = orderQuote(a,market,symbol,side,quantity);
  a.orders.push({id,symbol,side,quantity,status:"pending",placed:a.index,reserve:side === "buy" ? q.total : 0});
}

export function cancelOrder(a,id) {
  const order = a.orders.find(o => o.id === id);
  if (!order || order.status !== "pending") throw Error("This order is no longer pending.");
  order.status = "cancelled";
  order.closed = a.index;
}

function executeOrder(a, market, order) {
  const {symbol, side, quantity} = order;
  const price = fillPrice(market.series[symbol][a.index].o, side);
  const gross = price * quantity;
  const pos = a.positions[symbol] || {quantity:0, cost:0};
  order.closed = a.index;
  if (side === "buy" && gross + EXECUTION_FEE > a.cash) {
    order.status = "rejected";
    order.reason = "Opening price exceeded available cash.";
    return;
  }
  if (side === "sell" && (pos.quantity < quantity || gross <= EXECUTION_FEE)) {
    order.status = "rejected";
    order.reason = "Shares or net sale proceeds were insufficient.";
    return;
  }
  if (side === "buy") {
    const debit = gross + EXECUTION_FEE;
    a.cash -= debit;
    a.positions[symbol] = {quantity:pos.quantity + quantity, cost:pos.cost + debit};
  } else {
    const basis = quantity === pos.quantity ? pos.cost : Math.round(pos.cost * quantity / pos.quantity);
    a.cash += gross - EXECUTION_FEE;
    a.realized += gross - EXECUTION_FEE - basis;
    if (quantity === pos.quantity) delete a.positions[symbol];
    else a.positions[symbol] = {quantity:pos.quantity - quantity, cost:pos.cost - basis};
  }
  Object.assign(order, {status:"filled", price, fee:EXECUTION_FEE});
}

export function placeAlert(a,market,{id,symbol,level,direction}) {
  if (!Object.hasOwn(market.series,symbol) || !["above","below"].includes(direction) || !Number.isSafeInteger(level) || level <= 0) throw Error("Enter a positive alert level and a valid direction.");
  if (a.index === market.times.length - 1) throw Error("The replay has ended.");
  const price = market.series[symbol][a.index].c;
  if ((direction === "above" && level <= price) || (direction === "below" && level >= price)) throw Error("Set the level on the chosen side of the current price.");
  if (a.alerts.some(alert => alert.id === id)) return;
  a.alerts.push({id,symbol,level,direction,created:a.index,triggered:null});
}

export function advance(a, market) {
  if (a.index >= market.times.length - 1) throw Error("The replay has ended.");
  a.index++;
  for (const order of a.orders) if (order.status === "pending") executeOrder(a,market,order);
  for (const alert of a.alerts) {
    if (alert.triggered !== null) continue;
    const price = market.series[alert.symbol][a.index].c;
    if (alert.direction === "above" ? price >= alert.level : price <= alert.level) alert.triggered = a.index;
  }
}

export function sizePosition(cash, netEquity, entry, stop, riskPercent) {
  if (![cash,netEquity,entry,stop,riskPercent].every(Number.isFinite) || stop <= 0 || stop >= entry || riskPercent <= 0 || riskPercent > 100) throw Error("Use a positive stop below entry and a risk budget of 0–100% (exclusive of zero).");
  const riskBudget = Math.round(netEquity * riskPercent / 100);
  const entryFill = fillPrice(entry,"buy"), exitFill = fillPrice(stop,"sell");
  const riskPerShare = Math.max(1,entryFill - exitFill);
  const quantity = Math.max(0, Math.min(Math.floor((riskBudget - 2 * EXECUTION_FEE) / riskPerShare), Math.floor((cash - EXECUTION_FEE) / entryFill), 1000000));
  return {quantity,riskBudget,riskPerShare,plannedLoss:quantity ? quantity * riskPerShare + 2 * EXECUTION_FEE : 0};
}
