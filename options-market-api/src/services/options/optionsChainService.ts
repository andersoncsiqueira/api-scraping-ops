import {
  isCacheFresh,
  readJsonCache,
  writeJsonCache,
} from "../cacheService";

import type {
  OptionChainItem,
  OptionsChainResponse,
} from "./optionsChainTypes";

function normalizeUnderlying(underlying: string): string {
  return underlying.trim().toUpperCase();
}

function getManualOptionsChain(underlying: string): OptionChainItem[] {
  const cleanUnderlying = normalizeUnderlying(underlying);

  const updatedAt = new Date().toISOString();

  if (cleanUnderlying === "PETR4") {
    return [
      {
        symbol: "PETRF386",
        underlying: "PETR4",
        type: "CALL",
        expiration: "2026-06-19",
        strike: 38.6,
        lastPrice: null,
        bid: null,
        ask: null,
        volume: null,
        openInterest: null,
        updatedAt,
      },
      {
        symbol: "PETRF397",
        underlying: "PETR4",
        type: "CALL",
        expiration: "2026-06-19",
        strike: 39.7,
        lastPrice: null,
        bid: null,
        ask: null,
        volume: null,
        openInterest: null,
        updatedAt,
      },
      {
        symbol: "PETRF408",
        underlying: "PETR4",
        type: "CALL",
        expiration: "2026-06-19",
        strike: 40.86,
        lastPrice: null,
        bid: null,
        ask: null,
        volume: null,
        openInterest: null,
        updatedAt,
      },
      {
        symbol: "PETRF419",
        underlying: "PETR4",
        type: "CALL",
        expiration: "2026-06-19",
        strike: 41.98,
        lastPrice: null,
        bid: null,
        ask: null,
        volume: null,
        openInterest: null,
        updatedAt,
      },
      {
        symbol: "PETRF430",
        underlying: "PETR4",
        type: "CALL",
        expiration: "2026-06-19",
        strike: 43.0,
        lastPrice: null,
        bid: null,
        ask: null,
        volume: null,
        openInterest: null,
        updatedAt,
      },
      {
        symbol: "PETRR386",
        underlying: "PETR4",
        type: "PUT",
        expiration: "2026-06-19",
        strike: 38.6,
        lastPrice: null,
        bid: null,
        ask: null,
        volume: null,
        openInterest: null,
        updatedAt,
      },
      {
        symbol: "PETRR397",
        underlying: "PETR4",
        type: "PUT",
        expiration: "2026-06-19",
        strike: 39.7,
        lastPrice: null,
        bid: null,
        ask: null,
        volume: null,
        openInterest: null,
        updatedAt,
      },
      {
        symbol: "PETRR408",
        underlying: "PETR4",
        type: "PUT",
        expiration: "2026-06-19",
        strike: 40.86,
        lastPrice: null,
        bid: null,
        ask: null,
        volume: null,
        openInterest: null,
        updatedAt,
      },
      {
        symbol: "PETRR419",
        underlying: "PETR4",
        type: "PUT",
        expiration: "2026-06-19",
        strike: 41.98,
        lastPrice: null,
        bid: null,
        ask: null,
        volume: null,
        openInterest: null,
        updatedAt,
      },
    ];
  }

  if (cleanUnderlying === "VALE3") {
    return [
      {
        symbol: "VALEF600",
        underlying: "VALE3",
        type: "CALL",
        expiration: "2026-06-19",
        strike: 60.0,
        lastPrice: null,
        bid: null,
        ask: null,
        volume: null,
        openInterest: null,
        updatedAt,
      },
      {
        symbol: "VALEF620",
        underlying: "VALE3",
        type: "CALL",
        expiration: "2026-06-19",
        strike: 62.0,
        lastPrice: null,
        bid: null,
        ask: null,
        volume: null,
        openInterest: null,
        updatedAt,
      },
    ];
  }

  return [];
}

export async function getOptionsChain(
  underlying: string
): Promise<OptionsChainResponse> {
  const cleanUnderlying = normalizeUnderlying(underlying);

  const cacheFileName = `options_chain_${cleanUnderlying}.json`;

  const cached = await readJsonCache<OptionsChainResponse>(cacheFileName);

  if (cached && isCacheFresh(cached.updatedAt, 60)) {
    return {
      ...cached,
      source: "cache",
      cached: true,
    };
  }

  const options = getManualOptionsChain(cleanUnderlying);

  const result: OptionsChainResponse = {
    underlying: cleanUnderlying,
    source: "manual",
    cached: false,
    updatedAt: new Date().toISOString(),
    options,
  };

  await writeJsonCache(cacheFileName, result);

  return result;
}

export async function findOptionInChain(
  optionSymbol: string,
  underlying: string
): Promise<OptionChainItem | null> {
  const cleanOptionSymbol = optionSymbol.trim().toUpperCase();
  const chain = await getOptionsChain(underlying);

  return (
    chain.options.find((option) => option.symbol === cleanOptionSymbol) ?? null
  );
}