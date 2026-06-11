export type HistoryRange = "1w" | "1m" | "1y";

export type MarketCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketQuote = {
  symbol: string;
  price: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  updatedAt: string;
};

export type MarketEvent = {
  id: string;
  symbol: string;
  date: string;
  title: string;
  type: "options" | "earnings" | "dividend" | "event";
  description: string;
};

export type HistoryResponse = {
  symbol: string;
  range: HistoryRange;
  source: string;
  cached: boolean;
  updatedAt: string;
  candles: MarketCandle[];
};

export type QuoteResponse = {
  symbol: string;
  source: string;
  cached: boolean;
  updatedAt: string;
  quote: MarketQuote;
};