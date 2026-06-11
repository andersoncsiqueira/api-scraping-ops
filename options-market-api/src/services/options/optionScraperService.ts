import {
  isCacheFresh,
  readJsonCache,
  writeJsonCache,
} from "../cacheService";

import { parseBrazilianOptionCode } from "./optionCodeParser";
import { findOptionInChain } from "./optionsChainService";

import {
  mergeScrapedOptionWithLookup,
  scrapeOptionFromOpcoesNet,
} from "./opcoesNetScraperService";

import type {
  OptionLookupResponse,
  OptionQuote,
} from "./optionTypes";

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: unknown;
  };
};

function normalizeYahooOptionSymbol(symbol: string): string {
  const cleanSymbol = symbol.trim().toUpperCase();

  if (cleanSymbol.endsWith(".SA")) {
    return cleanSymbol;
  }

  return `${cleanSymbol}.SA`;
}

function toAppSymbol(symbol: string): string {
  return symbol.replace(".SA", "");
}

function getLastValidIndex(values: Array<number | null | undefined>): number {
  for (let i = values.length - 1; i >= 0; i--) {
    if (typeof values[i] === "number") {
      return i;
    }
  }

  return -1;
}

function parseYahooOptionQuote(
  symbol: string,
  data: YahooChartResponse
): OptionQuote | null {
  const result = data.chart?.result?.[0];

  if (!result) {
    return null;
  }

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];

  if (!quote) {
    return null;
  }

  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];

  const lastIndex = getLastValidIndex(closes);

  if (lastIndex === -1) {
    return null;
  }

  const previousIndex = lastIndex - 1 >= 0 ? lastIndex - 1 : lastIndex;

  const lastPrice = closes[lastIndex] ?? null;
  const previousClose = closes[previousIndex] ?? lastPrice;
  const volume = volumes[lastIndex] ?? null;

  const change =
    lastPrice !== null && previousClose !== null
      ? lastPrice - previousClose
      : null;

  const changePercent =
    change !== null && previousClose
      ? (change / previousClose) * 100
      : null;

  const timestamp = timestamps[lastIndex];

  return {
    symbol: toAppSymbol(symbol),
    lastPrice: lastPrice !== null ? Number(lastPrice.toFixed(2)) : null,
    previousClose:
      previousClose !== null ? Number(previousClose.toFixed(2)) : null,
    change: change !== null ? Number(change.toFixed(2)) : null,
    changePercent:
      changePercent !== null ? Number(changePercent.toFixed(2)) : null,
    volume: volume !== null ? Math.round(volume) : null,
    updatedAt: timestamp
      ? new Date(timestamp * 1000).toISOString()
      : new Date().toISOString(),
  };
}

async function fetchYahooOptionQuote(
  optionSymbol: string
): Promise<OptionQuote | null> {
  const yahooSymbol = normalizeYahooOptionSymbol(optionSymbol);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?range=5d&interval=1d`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as YahooChartResponse;

  return parseYahooOptionQuote(yahooSymbol, data);
}

export async function getOptionBySymbol(
  optionSymbol: string
): Promise<OptionLookupResponse> {
  const cleanSymbol = optionSymbol.trim().toUpperCase();

  const cacheFileName = `option_${cleanSymbol}.json`;

  const cached = await readJsonCache<OptionLookupResponse>(cacheFileName);

  if (cached && isCacheFresh(cached.updatedAt, 15)) {
    return {
      ...cached,
      warnings: [...cached.warnings, "Resposta carregada do cache local."],
    };
  }

  const parsed = parseBrazilianOptionCode(cleanSymbol);

  const warnings: string[] = [];

  try {
  const scraped = await scrapeOptionFromOpcoesNet(cleanSymbol, parsed);

  if (scraped && (scraped.strike !== null || scraped.quote !== null)) {
    const result = mergeScrapedOptionWithLookup(parsed, scraped);

    await writeJsonCache(cacheFileName, result);

    return result;
  }

  warnings.push("Opções.Net foi consultado, mas retornou dados incompletos.");
} catch (error) {
  console.error("Erro no scraper Opções.Net:", error);
  warnings.push("Erro ao tentar buscar dados no Opções.Net.");
}

  const optionFromChain = await findOptionInChain(
    parsed.symbol,
    parsed.underlying
  );

  let quote: OptionQuote | null = null;

  if (
    optionFromChain?.lastPrice !== null &&
    optionFromChain?.lastPrice !== undefined
  ) {
    quote = {
      symbol: optionFromChain.symbol,
      lastPrice: optionFromChain.lastPrice,
      previousClose: null,
      change: null,
      changePercent: null,
      volume: optionFromChain.volume,
      updatedAt: optionFromChain.updatedAt,
    };
  }

  if (!quote) {
    try {
      quote = await fetchYahooOptionQuote(cleanSymbol);

      if (!quote) {
        warnings.push(
          "Não foi possível encontrar cotação da opção no Yahoo Finance."
        );
      }
    } catch {
      warnings.push("Erro ao tentar buscar cotação da opção no Yahoo Finance.");
    }
  }

  if (!optionFromChain) {
    warnings.push(
      "A opção não foi encontrada na cadeia manual/cacheada. Dados de strike e vencimento real podem estar incompletos."
    );
  }

  if (parsed.expirationEstimated && !optionFromChain) {
    warnings.push(
      "O vencimento foi estimado pela letra da série e pela regra da terceira sexta-feira do mês."
    );
  }

  if (!optionFromChain?.strike) {
    warnings.push(
      "O strike real ainda não foi extraído de uma cadeia oficial de opções."
    );
  }

  const result: OptionLookupResponse = {
    symbol: parsed.symbol,
    underlying: parsed.underlying,
    type: optionFromChain?.type ?? parsed.type,
    seriesLetter: parsed.seriesLetter,
    codeNumber: parsed.codeNumber,
    expiration: optionFromChain?.expiration ?? parsed.estimatedExpiration,
    expirationEstimated: optionFromChain ? false : parsed.expirationEstimated,
    strike: optionFromChain?.strike ?? null,
    quote,
    source: optionFromChain ? "manual" : quote ? "Yahoo Finance" : "parser",
    updatedAt: new Date().toISOString(),
    warnings,
  };

  await writeJsonCache(cacheFileName, result);

  return result;
}