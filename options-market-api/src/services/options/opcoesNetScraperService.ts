import * as cheerio from "cheerio";

import type {
  OptionLookupResponse,
  OptionQuote,
  OptionType,
  ParsedOptionCode,
} from "./optionTypes";

type ScrapedOptionData = {
  symbol: string;
  underlying: string;
  type: OptionType;
  expiration: string;
  strike: number | null;
  quote: OptionQuote | null;
  source: "Opções.Net";
  updatedAt: string;
  warnings: string[];
};

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

function detectOptionType(text: string): OptionType | null {
  const upper = text.toUpperCase();

  if (upper.includes("CALL") || upper.includes("OPÇÃO DE COMPRA")) {
    return "CALL";
  }

  if (upper.includes("PUT") || upper.includes("OPÇÃO DE VENDA")) {
    return "PUT";
  }

  return null;
}

function parseHeaderData(
  optionSymbol: string,
  text: string,
  parsedFallback: ParsedOptionCode
): Pick<
  ScrapedOptionData,
  "symbol" | "underlying" | "type" | "expiration" | "strike"
> {
  const normalized = normalizeText(text);

  const symbol = optionSymbol.trim().toUpperCase();

  const type = detectOptionType(normalized) ?? parsedFallback.type;

  const underlyingMatch = normalized.match(
    new RegExp(`${symbol}\\s*-\\s*(?:CALL|PUT)\\s+de\\s+([A-Z0-9]{4,6})`, "i")
  );

  const underlying =
    underlyingMatch?.[1]?.toUpperCase() ?? parsedFallback.underlying;

  const strikeMatch = normalized.match(/Strike\s*R?\$?\s*([\d.,]+)/i);
  const strike = brNumberToFloat(strikeMatch?.[1]);

  const expirationMatch = normalized.match(
    /Vencimento\s+(\d{2}\/\d{2}\/\d{4})/i
  );

  const expiration =
    brDateToIso(expirationMatch?.[1]) ?? parsedFallback.estimatedExpiration;

  return {
    symbol,
    underlying,
    type,
    expiration,
    strike,
  };
}

function extractLatestQuoteFromText(
  optionSymbol: string,
  text: string
): OptionQuote | null {
  const normalized = normalizeText(text);

  /**
   * Tentativa de capturar linhas parecidas com:
   * 08/05/2026 13,50 13,90 13,71 13,82 13,91 14 338.745,00
   *
   * Colunas comuns no Opções.Net:
   * Data, Min, Pri/Abe, Med, Ult, Max, Nº Neg., Vol. Fin.
   */
  const rowRegex =
    /(\d{2}\/\d{2}\/\d{4})\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+([\d.,-]+)\s+(\d+)\s+([\d.,-]+)/g;

  let match: RegExpExecArray | null;
  let latest: RegExpExecArray | null = null;

  while ((match = rowRegex.exec(normalized)) !== null) {
    latest = match;
    break;
  }

  if (!latest) {
    return null;
  }

  const dateIso = brDateToIso(latest[1]);
  const lastPrice = brNumberToFloat(latest[5]);
  const volumeFinancial = brNumberToFloat(latest[8]);

  if (lastPrice === null) {
    return null;
  }

  return {
    symbol: optionSymbol,
    lastPrice,
    previousClose: null,
    change: null,
    changePercent: null,
    volume:
      volumeFinancial !== null ? Math.round(volumeFinancial) : null,
    updatedAt: dateIso
      ? `${dateIso}T00:00:00.000Z`
      : new Date().toISOString(),
  };
}

function extractLatestQuoteFromTables(
  optionSymbol: string,
  $: cheerio.CheerioAPI
): OptionQuote | null {
  let bestQuote: OptionQuote | null = null;

  $("table").each((_tableIndex, table) => {
    if (bestQuote) return;

    const rows = $(table).find("tr");

    rows.each((_rowIndex, row) => {
      if (bestQuote) return;

      const cells = $(row)
        .find("td, th")
        .map((_cellIndex, cell) => normalizeText($(cell).text()))
        .get()
        .filter(Boolean);

      if (cells.length < 6) return;

      const maybeDate = cells.find((cell) =>
        /\d{2}\/\d{2}\/\d{4}/.test(cell)
      );

      if (!maybeDate) return;

      const dateIso = brDateToIso(maybeDate);

      /**
       * Em muitas páginas do Opções.Net:
       * Data | Min | Pri | Med | Ult | Max | Negócios | Vol.Fin
       */
      const numericCells = cells
        .filter((cell) => /^[\d.,-]+$/.test(cell))
        .map((cell) => brNumberToFloat(cell))
        .filter((value): value is number => value !== null);

      if (numericCells.length < 5) return;

      const lastPrice = numericCells[3] ?? null;
      const volumeFinancial = numericCells[6] ?? null;

      if (lastPrice === null) return;

      bestQuote = {
        symbol: optionSymbol,
        lastPrice: Number(lastPrice.toFixed(2)),
        previousClose: null,
        change: null,
        changePercent: null,
        volume:
          volumeFinancial !== null && volumeFinancial !== undefined
            ? Math.round(volumeFinancial)
            : null,
        updatedAt: dateIso
          ? `${dateIso}T00:00:00.000Z`
          : new Date().toISOString(),
      };
    });
  });

  return bestQuote;
}

export async function scrapeOptionFromOpcoesNet(
  optionSymbol: string,
  parsedFallback: ParsedOptionCode
): Promise<ScrapedOptionData | null> {
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
    return null;
  }

  const html = await response.text();

  if (
    html.toLowerCase().includes("efetue login") &&
    !html.toUpperCase().includes(cleanSymbol)
  ) {
    return null;
  }

  const $ = cheerio.load(html);

  const pageTitle = normalizeText($("title").first().text());
  const h1 = normalizeText($("h1").first().text());
  const bodyText = normalizeText($("body").text());

  const fullText = normalizeText(`${pageTitle} ${h1} ${bodyText}`);

  if (!fullText.toUpperCase().includes(cleanSymbol)) {
    return null;
  }

  const headerData = parseHeaderData(cleanSymbol, fullText, parsedFallback);

  const quoteFromTables = extractLatestQuoteFromTables(cleanSymbol, $);
  const quoteFromText = quoteFromTables ?? extractLatestQuoteFromText(cleanSymbol, fullText);

  const warnings: string[] = [];

  if (headerData.strike === null) {
    warnings.push("Não foi possível extrair o strike no Opções.Net.");
  }

  if (!quoteFromText) {
    warnings.push(
      "Não foi possível extrair cotação recente da opção no Opções.Net."
    );
  }

  return {
    ...headerData,
    quote: quoteFromText,
    source: "Opções.Net",
    updatedAt: new Date().toISOString(),
    warnings,
  };
}

export function mergeScrapedOptionWithLookup(
  parsed: ParsedOptionCode,
  scraped: ScrapedOptionData,
  fallbackWarnings: string[] = []
): OptionLookupResponse {
  return {
    symbol: parsed.symbol,
    underlying: scraped.underlying,
    type: scraped.type,
    seriesLetter: parsed.seriesLetter,
    codeNumber: parsed.codeNumber,
    expiration: scraped.expiration,
    expirationEstimated: false,
    strike: scraped.strike,
    quote: scraped.quote,
    source: "Opções.Net",
    updatedAt: scraped.updatedAt,
    warnings: [...scraped.warnings, ...fallbackWarnings],
  };
}