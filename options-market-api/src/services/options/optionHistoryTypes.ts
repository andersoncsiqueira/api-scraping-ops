export type OptionHistoryRange = "1w" | "1m" | "1y";

export type OptionHistoryCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;

  /**
   * Mantemos volume como número genérico para facilitar o gráfico.
   * Em opções, muitas vezes isso pode representar volume financeiro,
   * dependendo da fonte.
   */
  volume: number | null;

  trades: number | null;
  volumeFinancial: number | null;
};

export type OptionHistoryResponse = {
  symbol: string;
  underlying: string;
  range: OptionHistoryRange;
  source: "Opções.Net" | "cache";
  cached: boolean;
  updatedAt: string;
  candles: OptionHistoryCandle[];
  warnings: string[];
};