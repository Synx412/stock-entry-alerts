import {usd,dateOf,timeOf} from "./market.mjs";

const NS = "http://www.w3.org/2000/svg";
const svgElement = (tag, props = {}, value) => {
  const el = document.createElementNS(NS,tag);
  for (const [key,val] of Object.entries(props)) el.setAttribute(key,String(val));
  if (value !== undefined) el.textContent = value;
  return el;
};
export function drawChart(svg, bars, times, type, symbol, cursorLabel) {
  svg.replaceChildren();
  const width = Math.max(290,svg.clientWidth || 640);
  const mobile = width < 500;
  const height = mobile ? 206 : 230;
  const left = 3, right = width - (mobile ? 53 : 62), top = 12, bottom = height - 53, volumeFloor = height - 24;
  const fullHigh = Math.max(...bars.map(b=>b.h)), fullLow = Math.min(...bars.map(b=>b.l));
  const margin = Math.max(2,Math.round((fullHigh-fullLow)*.12));
  const high = fullHigh + margin, low = Math.max(0,fullLow - margin);
  const step = (right - left) / bars.length;
  const x = i => left + (i + .5) * step;
  const y = price => top + (high - price) / (high - low) * (bottom - top);
  const add = (tag,attrs,value) => svg.appendChild(svgElement(tag,attrs,value));
  svg.setAttribute("viewBox","0 0 " + width + " " + height);
  svg.setAttribute("aria-label",symbol + " " + type + " chart, " + bars.length + " bars, last close " + usd(bars.at(-1).c));
  const id = "chart-fill";
  const defs = add("defs");
  const gradient = svgElement("linearGradient",{id,x1:"0",y1:"0",x2:"0",y2:"1"});
  gradient.append(svgElement("stop",{offset:"0%","stop-color":"#5c8970","stop-opacity":".23"}),svgElement("stop",{offset:"100%","stop-color":"#5c8970","stop-opacity":"0"}));
  defs.append(gradient);
  const volumeMax = Math.max(1,...bars.map(b=>b.v));
  for (let i = 0; i < 4; i++) {
    const p = low + (high-low) * i / 3, row = y(p);
    add("line",{x1:left,x2:right,y1:row,y2:row,stroke:"#e3e8df","stroke-dasharray":"3 5"});
    add("text",{x:right+7,y:row+4,class:"axis"},(p / 100).toFixed(2));
  }
  const ticks = new Set(Array.from({length:mobile ? 3 : 4},(_,i) => Math.round(i * (bars.length - 1) / (mobile ? 2 : 3))));
  for (const i of ticks) {
    const acrossDays = times[0] && dateOf(times[0]) !== dateOf(times.at(-1));
    const label = acrossDays ? new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",month:"short",day:"numeric"}).format(times[i]) + " " + timeOf(times[i]) : timeOf(times[i]);
    add("text",{x:i===0?left:i===bars.length-1?right:x(i),y:height-4,class:"axis","text-anchor":i===0?"start":i===bars.length-1?"end":"middle"},label);
  }
  if (type === "Line") {
    const points = bars.map((b,i) => x(i)+","+y(b.c));
    add("polygon",{points:[x(0)+","+bottom,...points,x(bars.length-1)+","+bottom].join(" "),fill:"url(#" + id + ")"});
    add("polyline",{points:points.join(" "),fill:"none",stroke:"#217456","stroke-width":"2.5","stroke-linejoin":"round"});
  }
  bars.forEach((b,i) => {
    const up = b.c >= b.o, color = up ? "#34785d" : "#bf654e", col = Math.max(.7,step*.62);
    if (type === "Candles") {
      add("line",{x1:x(i),x2:x(i),y1:y(b.h),y2:y(b.l),stroke:color,"stroke-width":1.35});
      add("rect",{x:x(i)-col/2,y:Math.min(y(b.o),y(b.c)),width:col,height:Math.max(1.6,Math.abs(y(b.o)-y(b.c))),fill:color});
    }
    const h = b.v / volumeMax * 16;
    add("rect",{x:x(i)-col/2,y:volumeFloor-h,width:col,height:h,fill:color,opacity:".30"});
  });
  const endY = y(bars.at(-1).c);
  add("line",{x1:left,x2:right,y1:endY,y2:endY,stroke:"#427659","stroke-dasharray":"4 4",opacity:".5"});
  add("rect",{x:right+1,y:endY-9,width:width-right-1,height:18,rx:3,fill:"#254d37"});
  add("text",{x:right+5,y:endY+4,class:"axis last-price"},(bars.at(-1).c/100).toFixed(2));
  const cross = add("line",{x1:0,x2:0,y1:top,y2:volumeFloor,stroke:"#7b8478","stroke-dasharray":"2 4",visibility:"hidden"});
  const inspect = event => {
    const bounds = svg.getBoundingClientRect();
    const i = Math.max(0,Math.min(bars.length-1,Math.floor(((event.clientX-bounds.left)*width/bounds.width-left)/step)));
    cross.setAttribute("x1",x(i)); cross.setAttribute("x2",x(i)); cross.setAttribute("visibility","visible");
    const b=bars[i]; cursorLabel.textContent=timeOf(times[i])+" ET  ·  O "+usd(b.o)+"  H "+usd(b.h)+"  L "+usd(b.l)+"  C "+usd(b.c);
  };
  const original = cursorLabel.dataset.default;
  svg.onpointermove = inspect;
  svg.onpointerleave = () => { cross.setAttribute("visibility","hidden"); cursorLabel.textContent = original; };
}
