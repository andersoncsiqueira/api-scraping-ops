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
import { fetchBrapiJson } from "./brapiService";

type BrapiStockQuoteResponse = {
  results?: Array<{
    symbol?: string;
    data?: {
      regularMarketPrice?: number | null;
      regularMarketPreviousClose?: number | null;
      regularMarketChange?: number | null;
      regularMarketChangePercent?: number | null;
      regularMarketTime?: string | null;
    };
  }>;
};

type BrapiStockHistoryResponse = {
  results?: Array<{
    symbol?: string;
    data?: {
      historicalDataPrice?: Array<{
        date?: number;
        open?: number | null;
        high?: number | null;
        low?: number | null;
        close?: number | null;
        volume?: number | null;
      }>;
    };
  }>;
};

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

function normalizeBrapiSymbol(symbol: string): string {
  return toAppSymbol(normalizeSymbol(symbol));
}

function getBrapiRange(range: HistoryRange): string {
  if (range === "1w") return "7d";
  if (range === "1m") return "1mo";

  return "1y";
}

function parseBrapiHistoryResponse(data: BrapiStockHistoryResponse): {
  symbol: string;
  candles: MarketCandle[];
} | null {
  const result = data.results?.[0];
  const prices = result?.data?.historicalDataPrice ?? [];
  const candles = prices
    .map((item) => {
      const { date, open, high, low, close, volume } = item;

      if (
        typeof date !== "number" ||
        open === null ||
        open === undefined ||
        high === null ||
        high === undefined ||
        low === null ||
        low === undefined ||
        close === null ||
        close === undefined ||
        volume === null ||
        volume === undefined
      ) {
        return null;
      }

      return {
        date: new Date(date * 1000).toISOString().slice(0, 10),
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: Math.round(volume),
      };
    })
    .filter((item): item is MarketCandle => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!result?.symbol || candles.length === 0) {
    return null;
  }

  return {
    symbol: result.symbol,
    candles,
  };
}

async function fetchBrapiHistory(
  symbol: string,
  range: HistoryRange
): Promise<HistoryResponse | null> {
  const appSymbol = normalizeBrapiSymbol(symbol);
  const data = await fetchBrapiJson<BrapiStockHistoryResponse>(
    "/stocks/historical",
    {
      symbols: appSymbol,
      range: getBrapiRange(range),
      interval: "1d",
      sortOrder: "asc",
    }
  );

  const parsed = parseBrapiHistoryResponse(data);

  if (!parsed) {
    return null;
  }

  return {
    symbol: parsed.symbol,
    range,
    source: "brapi.dev",
    cached: false,
    updatedAt: new Date().toISOString(),
    candles: parsed.candles,
  };
}

async function fetchBrapiQuote(symbol: string): Promise<QuoteResponse | null> {
  const appSymbol = normalizeBrapiSymbol(symbol);
  const data = await fetchBrapiJson<BrapiStockQuoteResponse>("/stocks/quote", {
    symbols: appSymbol,
  });

  const result = data.results?.[0];
  const quoteData = result?.data;
  const price = quoteData?.regularMarketPrice;

  if (!result?.symbol || price === null || price === undefined) {
    return null;
  }

  const previousClose = quoteData?.regularMarketPreviousClose ?? price;
  const change = quoteData?.regularMarketChange ?? price - previousClose;
  const changePercent =
    quoteData?.regularMarketChangePercent ??
    (previousClose ? (change / previousClose) * 100 : 0);
  const updatedAt = quoteData?.regularMarketTime ?? new Date().toISOString();

  return {
    symbol: result.symbol,
    source: "brapi.dev",
    cached: false,
    updatedAt,
    quote: {
      symbol: result.symbol,
      price: Number(price.toFixed(2)),
      previousClose: Number(previousClose.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      updatedAt,
    },
  };
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

  try {
    const brapiHistory = await fetchBrapiHistory(appSymbol, range);

    if (brapiHistory) {
      await writeJsonCache(cacheFileName, brapiHistory);

      return brapiHistory;
    }
  } catch (error) {
    console.error("Erro ao buscar histórico na brapi.dev:", error);
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
  try {
    const brapiQuote = await fetchBrapiQuote(symbol);

    if (brapiQuote) {
      return brapiQuote;
    }
  } catch (error) {
    console.error("Erro ao buscar cotação na brapi.dev:", error);
  }

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
