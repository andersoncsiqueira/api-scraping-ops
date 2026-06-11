import type {
  HistoryRange,
  HistoryResponse,
  MarketCandle,
  MarketQuote,
  QuoteResponse,
} from "../types/marketData";

import {
  isCacheFresh,
  readJsonCache,
  writeJsonCache,
} from "./cacheService";

function normalizeSymbol(symbol: string): string {
  const cleanSymbol = symbol.trim().toUpperCase();

  if (cleanSymbol.endsWith(".SA")) {
    return cleanSymbol;
  }

  return `${cleanSymbol}.SA`;
}

function getYahooRange(range: HistoryRange): string {
  if (range === "1w") return "5d";
  if (range === "1m") return "1mo";

  return "1y";
}

function getYahooInterval(range: HistoryRange): string {
  if (range === "1w") return "1d";
  if (range === "1m") return "1d";

  return "1d";
}

function toAppSymbol(symbol: string): string {
  return symbol.replace(".SA", "");
}

function parseYahooChartResponse(data: any): MarketCandle[] {
  const result = data?.chart?.result?.[0];

  if (!result) {
    return [];
  }

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];

  if (!quote) {
    return [];
  }

  const opens: Array<number | null> = quote.open ?? [];
  const highs: Array<number | null> = quote.high ?? [];
  const lows: Array<number | null> = quote.low ?? [];
  const closes: Array<number | null> = quote.close ?? [];
  const volumes: Array<number | null> = quote.volume ?? [];

  const candles: MarketCandle[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const volume = volumes[i];

    if (
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      volume === null
    ) {
      continue;
    }

    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);

    candles.push({
      date,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.round(volume),
    });
  }

  return candles;
}

export async function getYahooHistory(
  symbol: string,
  range: HistoryRange
): Promise<HistoryResponse> {
  const yahooSymbol = normalizeSymbol(symbol);
  const appSymbol = toAppSymbol(yahooSymbol);

  const cacheFileName = `history_${appSymbol}_${range}.json`;

  const cached = await readJsonCache<HistoryResponse>(cacheFileName);

  if (cached && isCacheFresh(cached.updatedAt, 60)) {
    return {
      ...cached,
      cached: true,
    };
  }

  const yahooRange = getYahooRange(range);
  const yahooInterval = getYahooInterval(range);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?range=${yahooRange}&interval=${yahooInterval}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar histórico: ${response.status}`);
  }

  const data = await response.json();

  const candles = parseYahooChartResponse(data);

  if (candles.length === 0) {
    throw new Error("Nenhum candle encontrado para o ativo informado.");
  }

  const result: HistoryResponse = {
    symbol: appSymbol,
    range,
    source: "Yahoo Finance",
    cached: false,
    updatedAt: new Date().toISOString(),
    candles,
  };

  await writeJsonCache(cacheFileName, result);

  return result;
}

export async function getYahooQuote(symbol: string): Promise<QuoteResponse> {
  const history = await getYahooHistory(symbol, "1w");

  const candles = history.candles;

  const lastCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];

  const price = lastCandle.close;
  const previousClose = previousCandle?.close ?? price;

  const change = price - previousClose;
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;

  const quote: MarketQuote = {
    symbol: history.symbol,
    price,
    previousClose,
    change: Number(change.toFixed(2)),
    changePercent: Number(changePercent.toFixed(2)),
    updatedAt: new Date().toISOString(),
  };

  return {
    symbol: history.symbol,
    source: "Yahoo Finance",
    cached: history.cached,
    updatedAt: quote.updatedAt,
    quote,
  };
}