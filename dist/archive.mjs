const apple = "https://www.apple.com/newsroom/2025/07/apple-reports-third-quarter-results/";
const microsoft = "https://www.microsoft.com/en-us/Investor/earnings/FY-2025-Q4/press-release-webcast";
export const houseReport = "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2025/20026590.pdf";
export const headlines = [
  {date:"2025-09-09", symbol:"AAPL", title:"Apple announces iPhone 17", publisher:"Apple Newsroom", url:"https://www.apple.com/in/newsroom/2025/09/apple-introduces-iphone-17/"},
  {date:"2025-07-31", symbol:"AAPL", title:"Apple reports its June-quarter revenue and earnings", publisher:"Apple Investor Relations", url:apple},
  {date:"2025-07-30", symbol:"MSFT", title:"Microsoft publishes fourth-quarter FY2025 results", publisher:"Microsoft Investor Relations", url:microsoft},
];
export const earnings = [
  {date:"2025-07-31", symbol:"AAPL", quarter:"FY2025 Q3", revenue:"$94.0B", growth:"+10%", eps:"$1.57", url:apple},
  {date:"2025-07-30", symbol:"MSFT", quarter:"FY2025 Q4", revenue:"$76.4B", growth:"+18%", eps:"$3.65", url:microsoft}
];
export const disclosures = [
  {symbol:"GOOGL",date:"2025-01-14", asset:"Call options", side:"Purchase", amount:"$250,001–$500,000"},
  {symbol:"AMZN",date:"2025-01-14", asset:"Call options", side:"Purchase", amount:"$250,001–$500,000"},
  {symbol:"NVDA",date:"2025-01-14", asset:"Call options", side:"Purchase", amount:"$250,001–$500,000"},
  {symbol:"AAPL",date:"2024-12-31", asset:"Common stock", side:"Partial sale", amount:"$5,000,001–$25,000,000"},
  {symbol:"NVDA",date:"2024-12-31", asset:"Common stock", side:"Partial sale", amount:"$1,000,001–$5,000,000"}
];
export const filingDate = "2025-01-17";
