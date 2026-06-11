export type OptionType = "CALL" | "PUT";

export type OptionSource =
  | "parser"
  | "Yahoo Finance"
  | "Opções.Net"
  | "manual"
  | "unknown";

export type ParsedOptionCode = {
  symbol: string;
  root: string;
  underlying: string;
  seriesLetter: string;
  codeNumber: string;
  type: OptionType;
  expirationMonth: number;
  expirationMonthName: string;
  estimatedExpiration: string;
  expirationEstimated: boolean;
};

export type OptionQuote = {
  symbol: string;
  lastPrice: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  updatedAt: string;
};

export type OptionLookupResponse = {
  symbol: string;
  underlying: string;
  type: OptionType;
  seriesLetter: string;
  codeNumber: string;
  expiration: string;
  expirationEstimated: boolean;
  strike: number | null;
  quote: OptionQuote | null;
  source: OptionSource;
  updatedAt: string;
  warnings: string[];
};