import type { OptionType } from "./optionTypes";

export type OptionChainSource = "manual" | "scraper" | "cache" | "Opções.Net";

export type OptionChainItem = {
  symbol: string;
  underlying: string;
  type: OptionType;
  expiration: string;
  strike: number;
  lastPrice: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  openInterest: number | null;
  updatedAt: string;
};

export type OptionsChainResponse = {
  underlying: string;
  source: OptionChainSource;
  cached: boolean;
  updatedAt: string;
  options: OptionChainItem[];
};