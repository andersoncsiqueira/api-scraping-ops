import * as cheerio from "cheerio";

import {
  isCacheFresh,
  readJsonCache,
  writeJsonCache,
} from "../cacheService";

import { parseBrazilianOptionCode } from "./optionCodeParser";

import type {
  OptionHistoryCandle,
  OptionHistoryRange,
  OptionHistoryResponse,
} from "./optionHistoryTypes";

function normalizeText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function brNumberToFloat(value: string | undefined | null): number | null {
  if (!value) return null;

  const cleaned = value
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "")
    .trim();

  if (!cleaned) return null;

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function brDateToIso(value: string | undefined | null): string | null {
  if (!value) return null;

  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);

  if (!match) return null;

  const [, day, month, year] = match;

  return `${year}-${month}-${day}`;
}

function getDaysByRange(range: OptionHistoryRange): number {
  if (range === "1w") return 7;
  if (range === "1m") return 30;

  return 365;
}

function filterCandlesByRange(
  candles: OptionHistoryCandle[],
  range: OptionHistoryRange
): OptionHistoryCandle[] {
  const days = getDaysByRange(range);

  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() - days);

  return candles.filter((candle) => {
    const candleDate = new Date(candle.date + "T00:00:00");

    return candleDate >= limitDate;
  });
}

function parseRowCells(cells: string[]): OptionHistoryCandle | null {
  const dateCell = cells.find((cell) => /\d{2}\/\d{2}\/\d{4}/.test(cell));

  const date = brDateToIso(dateCell);

  if (!date) return null;

  /**
   * Opções.Net normalmente apresenta algo parecido com:
   *
   * Data | Min | Pri/Abe | Med | Ult | Max | Nº Neg. | Vol. Fin.
   *
   * Depois de remover a data, esperamos números assim:
   * [min, open, average, close, high, trades, volumeFinancial]
   */
  const numericCells = cells
    .filter((cell) => /^[\d.,-]+$/.test(cell))
    .map((cell) => brNumberToFloat(cell))
    .filter((value): value is number => value !== null);

  if (numericCells.length < 5) {
    return null;
  }

  const low = numericCells[0];
  const open = numericCells[1] ?? numericCells[0];
  const close = numericCells[3] ?? numericCells[numericCells.length - 1];
  const high = numericCells[4] ?? Math.max(open, close, low);

  const trades = numericCells[5] ?? null;
  const volumeFinancial = numericCells[6] ?? null;

  if (
    typeof open !== "number" ||
    typeof high !== "number" ||
    typeof low !== "number" ||
    typeof close !== "number"
  ) {
    return null;
  }

  return {
    date,
    open: Number(open.toFixed(2)),
    high: Number(high.toFixed(2)),
    low: Number(low.toFixed(2)),
    close: Number(close.toFixed(2)),
    volume:
      volumeFinancial !== null && volumeFinancial !== undefined
        ? Math.round(volumeFinancial)
        : null,
    trades:
      trades !== null && trades !== undefined ? Math.round(trades) : null,
    volumeFinancial:
      volumeFinancial !== null && volumeFinancial !== undefined
        ? Number(volumeFinancial.toFixed(2))
        : null,
  };
}

function extractHistoryFromTables($: cheerio.CheerioAPI): OptionHistoryCandle[] {
  const candles: OptionHistoryCandle[] = [];

  $("table").each((_tableIndex, table) => {
    const rows = $(table).find("tr");

    rows.each((_rowIndex, row) => {
      const cells = $(row)
        .find("td, th")
        .map((_cellIndex, cell) => normalizeText($(cell).text()))
        .get()
        .filter(Boolean);

      if (cells.length < 6) return;

      const candle = parseRowCells(cells);

      if (candle) {
        candles.push(candle);
      }
    });
  });

  const uniqueByDate = new Map<string, OptionHistoryCandle>();

  for (const candle of candles) {
    uniqueByDate.set(candle.date, candle);
  }

  return Array.from(uniqueByDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

function extractHistoryFromText(text: string): OptionHistoryCandle[] {
  const candles: OptionHistoryCandle[] = [];

  const normalized = normalizeText(text);

  /**
   * Captura linhas no padrão:
   * 10/06/2026 1,22 1,30 1,34 1,36 1,42 25 443.202,00
   */
  const rowRegex =
    /(\d{2}\/\d{2}\/\d{4})\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)/g;

  let match: RegExpExecArray | null;

  while ((match = rowRegex.exec(normalized)) !== null) {
    const date = brDateToIso(match[1]);

    if (!date) continue;

    const low = brNumberToFloat(match[2]);
    const open = brNumberToFloat(match[3]);
    const close = brNumberToFloat(match[5]);
    const high = brNumberToFloat(match[6]);
    const trades = brNumberToFloat(match[7]);
    const volumeFinancial = brNumberToFloat(match[8]);

    if (
      low === null ||
      open === null ||
      close === null ||
      high === null
    ) {
      continue;
    }

    candles.push({
      date,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume:
        volumeFinancial !== null ? Math.round(volumeFinancial) : null,
      trades: trades !== null ? Math.round(trades) : null,
      volumeFinancial:
        volumeFinancial !== null
          ? Number(volumeFinancial.toFixed(2))
          : null,
    });
  }

  const uniqueByDate = new Map<string, OptionHistoryCandle>();

  for (const candle of candles) {
    uniqueByDate.set(candle.date, candle);
  }

  return Array.from(uniqueByDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

async function scrapeOptionHistoryFromOpcoesNet(
  optionSymbol: string
): Promise<OptionHistoryCandle[]> {
  const cleanSymbol = optionSymbol.trim().toUpperCase();

  const url = `https://opcoes.net.br/${encodeURIComponent(cleanSymbol)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar página da opção: ${response.status}`);
  }

  const html = await response.text();

  const $ = cheerio.load(html);

  const bodyText = normalizeText($("body").text());

  if (!bodyText.toUpperCase().includes(cleanSymbol)) {
    throw new Error("A página retornada não parece ser da opção solicitada.");
  }

  const fromTables = extractHistoryFromTables($);

  if (fromTables.length > 0) {
    return fromTables;
  }

  return extractHistoryFromText(bodyText);
}

export async function getOptionHistory(
  optionSymbol: string,
  range: OptionHistoryRange
): Promise<OptionHistoryResponse> {
  const cleanSymbol = optionSymbol.trim().toUpperCase();

  const parsed = parseBrazilianOptionCode(cleanSymbol);

  const cacheFileName = `option_history_${cleanSymbol}_${range}.json`;

  const cached = await readJsonCache<OptionHistoryResponse>(cacheFileName);

  if (cached && isCacheFresh(cached.updatedAt, 15)) {
    return {
      ...cached,
      source: "cache",
      cached: true,
    };
  }

  const warnings: string[] = [];

  const allCandles = await scrapeOptionHistoryFromOpcoesNet(cleanSymbol);

  if (allCandles.length === 0) {
    warnings.push(
      "Nenhum histórico de negociação foi encontrado para essa opção."
    );
  }

  const candles = filterCandlesByRange(allCandles, range);

  if (candles.length === 0 && allCandles.length > 0) {
    warnings.push(
      "Existe histórico da opção, mas nenhum candle dentro do período solicitado."
    );
  }

  const result: OptionHistoryResponse = {
    symbol: parsed.symbol,
    underlying: parsed.underlying,
    range,
    source: "Opções.Net",
    cached: false,
    updatedAt: new Date().toISOString(),
    candles,
    warnings,
  };

  await writeJsonCache(cacheFileName, result);

  return result;
}