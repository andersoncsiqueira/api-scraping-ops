import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import {
  isCacheFresh,
  readJsonCache,
  writeJsonCache,
} from "../cacheService";

import type {
  OptionChainItem,
  OptionsChainResponse,
} from "./optionsChainTypes";

type OptionKind = "CALL" | "PUT";

const SOURCE_NAME = "Opções.Net";
const CACHE_MINUTES = Number(process.env.OPTIONS_CHAIN_CACHE_MINUTES ?? 5);
const FETCH_TIMEOUT_MS = Number(process.env.OPTIONS_SCRAPER_TIMEOUT_MS ?? 8000);
const MINIMUM_VALID_CHAIN_SIZE = 10;
const pendingChainLookups = new Map<string, Promise<OptionsChainResponse>>();

function normalizeUnderlying(underlying: string): string {
  return underlying.trim().toUpperCase();
}

function getUnderlyingRoot(underlying: string): string {
  const match = normalizeUnderlying(underlying).match(/^[A-Z]{4}/);

  if (!match) {
    throw new Error(
      `Ativo inválido: ${underlying}. Use um código como PETR4 ou VALE3.`
    );
  }

  return match[0];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBrazilianNumber(value: string): number | null {
  const cleanValue = value
    .replace(/\u00a0/g, " ")
    .replace(/R\$/gi, "")
    .trim();

  const match = cleanValue.match(
    /-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?|-?\d+\.\d+/
  );

  if (!match) return null;

  const rawNumber = match[0];

  let normalized: string;

  if (rawNumber.includes(",")) {
    normalized = rawNumber.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = rawNumber;
  }

  const numberValue = Number(normalized);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseBrazilianDate(value: string): string | null {
  const match = value.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);

  if (!match) return null;

  const [, day, month, year] = match;

  return `${year}-${month}-${day}`;
}

function extractDates(value: string): string[] {
  const dates: string[] = [];
  const regex = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;

  for (const match of value.matchAll(regex)) {
    const [, day, month, year] = match;
    dates.push(`${year}-${month}-${day}`);
  }

  return dates;
}

function isPossibleStrike(value: number | null): value is number {
  return value !== null && value > 0 && value < 1_000_000;
}

function getOptionSymbolPattern(underlying: string): RegExp {
  const root = getUnderlyingRoot(underlying);

  /*
    Exemplos aceitos:
    PETRF342
    PETRG414W1
    VALEF600
    BOVAG130
  */
  return new RegExp(
    `^${escapeRegExp(root)}[A-X](?=[A-Z0-9]*\\d)[A-Z0-9]+$`,
    "i"
  );
}

function normalizeOptionSymbol(
  value: string,
  underlying: string
): string | null {
  const symbol = value
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

  const pattern = getOptionSymbolPattern(underlying);

  return pattern.test(symbol) ? symbol : null;
}

function extractSymbolsFromText(
  value: string,
  underlying: string
): string[] {
  const root = getUnderlyingRoot(underlying);
  const broadPattern = new RegExp(
    `${escapeRegExp(root)}[A-X][A-Z0-9]+`,
    "gi"
  );

  const symbols = new Set<string>();

  for (const match of value.matchAll(broadPattern)) {
    const normalized = normalizeOptionSymbol(match[0], underlying);

    if (normalized) {
      symbols.add(normalized);
    }
  }

  return Array.from(symbols);
}

function buildItem(params: {
  symbol: string;
  underlying: string;
  type: OptionKind;
  strike: number;
  expiration: string;
  updatedAt: string;
}): OptionChainItem {
  return {
    symbol: params.symbol,
    underlying: params.underlying,
    type: params.type,
    expiration: params.expiration,
    strike: params.strike,
    lastPrice: null,
    bid: null,
    ask: null,
    volume: null,
    financialVolume: null,
    trades: null,
    openInterest: null,
    updatedAt: params.updatedAt,
  };
}

function findMatrixTable(
  $: cheerio.CheerioAPI,
  underlying: string
): cheerio.Cheerio<AnyNode> | null {
  let bestTable: cheerio.Cheerio<AnyNode> | null = null;
  let bestScore = 0;

  $("table").each((_index, tableElement) => {
    const table = $(tableElement);
    let score = 0;

    table.find("a").each((_linkIndex, linkElement) => {
      const link = $(linkElement);
      const text = `${link.text()} ${link.attr("href") ?? ""}`;

      score += extractSymbolsFromText(text, underlying).length;
    });

    if (score === 0) {
      score = extractSymbolsFromText(table.text(), underlying).length;
    }

    if (score > bestScore) {
      bestScore = score;
      bestTable = table;
    }
  });

  return bestTable;
}

function collectColumnDates(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<AnyNode>
): Map<number, string> {
  const dateByColumn = new Map<number, string>();

  table.find("tr").each((_rowIndex, rowElement) => {
    const cells = $(rowElement).children("th, td");

    cells.each((cellIndex, cellElement) => {
      if (dateByColumn.has(cellIndex)) return;

      const date = parseBrazilianDate($(cellElement).text());

      if (date) {
        dateByColumn.set(cellIndex, date);
      }
    });
  });

  return dateByColumn;
}

function getStrikeFromRow(
  $: cheerio.CheerioAPI,
  rowElement: AnyNode
): number | null {
  const cells = $(rowElement).children("th, td");

  for (let index = 0; index < cells.length; index += 1) {
    const text = $(cells[index]).text().trim();

    if (!text || parseBrazilianDate(text)) continue;

    const numberValue = parseBrazilianNumber(text);

    if (isPossibleStrike(numberValue)) {
      return numberValue;
    }
  }

  return null;
}

function getDateFromRow(
  $: cheerio.CheerioAPI,
  rowElement: AnyNode
): string | null {
  const cells = $(rowElement).children("th, td");

  for (let index = 0; index < cells.length; index += 1) {
    const date = parseBrazilianDate($(cells[index]).text());

    if (date) return date;
  }

  return null;
}

function parseMatrixWithColumns(params: {
  html: string;
  underlying: string;
  type: OptionKind;
  updatedAt: string;
}): OptionChainItem[] {
  const { html, underlying, type, updatedAt } = params;
  const $ = cheerio.load(html);
  const table = findMatrixTable($, underlying);

  if (!table) return [];

  const dateByColumn = collectColumnDates($, table);
  const options: OptionChainItem[] = [];

  table.find("tr").each((_rowIndex, rowElement) => {
    const strike = getStrikeFromRow($, rowElement);

    if (!isPossibleStrike(strike)) return;

    const rowDate = getDateFromRow($, rowElement);
    const cells = $(rowElement).children("th, td");

    cells.each((cellIndex, cellElement) => {
      const cell = $(cellElement);
      const cellText = cell.text();
      const cellHrefText = cell
        .find("a")
        .map((_linkIndex, linkElement) => {
          const link = $(linkElement);

          return `${link.text()} ${link.attr("href") ?? ""}`;
        })
        .get()
        .join(" ");

      const symbols = extractSymbolsFromText(
        `${cellText} ${cellHrefText}`,
        underlying
      );

      if (symbols.length === 0) return;

      const expiration = dateByColumn.get(cellIndex) ?? rowDate;

      if (!expiration) return;

      for (const symbol of symbols) {
        options.push(
          buildItem({
            symbol,
            underlying,
            type,
            strike,
            expiration,
            updatedAt,
          })
        );
      }
    });
  });

  return options;
}

function parseMatrixByAnchorPosition(params: {
  html: string;
  underlying: string;
  type: OptionKind;
  updatedAt: string;
}): OptionChainItem[] {
  const { html, underlying, type, updatedAt } = params;
  const $ = cheerio.load(html);
  const options: OptionChainItem[] = [];

  $("a").each((_index, linkElement) => {
    const link = $(linkElement);
    const href = link.attr("href") ?? "";
    const symbols = extractSymbolsFromText(
      `${link.text()} ${href}`,
      underlying
    );

    if (symbols.length === 0) return;

    const cell = link.closest("td, th");
    const row = link.closest("tr");

    const strike =
      parseBrazilianNumber(
        row
          .children("th, td")
          .filter((_cellIndex, cellElement) => {
            const text = $(cellElement).text();

            return !parseBrazilianDate(text);
          })
          .first()
          .text()
      ) ?? parseBrazilianNumber(cell.text());

    if (!isPossibleStrike(strike)) return;

    let expiration: string | null = null;

    const cellIndex = cell.index();
    const table = link.closest("table");

    if (table.length > 0 && cellIndex >= 0) {
      const dateByColumn = collectColumnDates($, table);
      expiration = dateByColumn.get(cellIndex) ?? null;
    }

    if (!expiration) {
      expiration = parseBrazilianDate(row.text());
    }

    if (!expiration) return;

    for (const symbol of symbols) {
      options.push(
        buildItem({
          symbol,
          underlying,
          type,
          strike,
          expiration,
          updatedAt,
        })
      );
    }
  });

  return options;
}

function parseMatrixTextFallback(params: {
  html: string;
  underlying: string;
  type: OptionKind;
  updatedAt: string;
}): OptionChainItem[] {
  const { html, underlying, type, updatedAt } = params;
  const $ = cheerio.load(html);
  const pageText = $("body").text().replace(/\s+/g, " ").trim();

  const knownDates = extractDates(pageText);

  if (knownDates.length === 0) return [];

  /*
    Este fallback é usado apenas se a estrutura da tabela mudar.
    Ele captura strike + símbolo no texto e usa o vencimento único quando
    a página filtrada trouxer apenas uma data.
  */
  if (knownDates.length !== 1) return [];

  const expiration = knownDates[0];
  const root = getUnderlyingRoot(underlying);
  const pattern = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*(${escapeRegExp(
      root
    )}[A-X][A-Z0-9]+)`,
    "gi"
  );

  const options: OptionChainItem[] = [];

  for (const match of pageText.matchAll(pattern)) {
    const strike = parseBrazilianNumber(match[1]);
    const symbol = normalizeOptionSymbol(match[2], underlying);

    if (!isPossibleStrike(strike) || !symbol) continue;

    options.push(
      buildItem({
        symbol,
        underlying,
        type,
        strike,
        expiration,
        updatedAt,
      })
    );
  }

  return options;
}

function parseMatrixPage(params: {
  html: string;
  underlying: string;
  type: OptionKind;
  updatedAt: string;
}): OptionChainItem[] {
  const parsedByColumns = parseMatrixWithColumns(params);

  if (parsedByColumns.length > 0) {
    return parsedByColumns;
  }

  const parsedByAnchors = parseMatrixByAnchorPosition(params);

  if (parsedByAnchors.length > 0) {
    return parsedByAnchors;
  }

  return parseMatrixTextFallback(params);
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
        "Cache-Control": "no-cache",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Opções.Net respondeu ${response.status} ao acessar ${url}.`
      );
    }

    const html = await response.text();

    if (!html || html.length < 500) {
      throw new Error(`Resposta vazia ou incompleta recebida de ${url}.`);
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
}

async function scrapeOptionsChain(
  underlying: string
): Promise<OptionChainItem[]> {
  const cleanUnderlying = normalizeUnderlying(underlying);
  const updatedAt = new Date().toISOString();

  const callUrl =
    `https://opcoes.net.br/matriz-opcoes-strike-x-vencimento/` +
    `CALLs/${encodeURIComponent(cleanUnderlying)}`;

  const putUrl =
    `https://opcoes.net.br/matriz-opcoes-strike-x-vencimento/` +
    `PUTs/${encodeURIComponent(cleanUnderlying)}`;

  const [callsHtml, putsHtml] = await Promise.all([
    fetchHtml(callUrl),
    fetchHtml(putUrl),
  ]);

  const calls = parseMatrixPage({
    html: callsHtml,
    underlying: cleanUnderlying,
    type: "CALL",
    updatedAt,
  });

  const puts = parseMatrixPage({
    html: putsHtml,
    underlying: cleanUnderlying,
    type: "PUT",
    updatedAt,
  });

  const uniqueOptions = new Map<string, OptionChainItem>();

  for (const option of [...calls, ...puts]) {
    uniqueOptions.set(option.symbol, option);
  }

  return Array.from(uniqueOptions.values()).sort((a, b) => {
    const expirationCompare = a.expiration.localeCompare(b.expiration);

    if (expirationCompare !== 0) {
      return expirationCompare;
    }

    const strikeCompare = a.strike - b.strike;

    if (strikeCompare !== 0) {
      return strikeCompare;
    }

    return a.symbol.localeCompare(b.symbol);
  });
}

function isUsefulCache(
  cached: OptionsChainResponse | null
): cached is OptionsChainResponse {
  return Boolean(
    cached &&
      Array.isArray(cached.options) &&
      cached.options.length >= MINIMUM_VALID_CHAIN_SIZE
  );
}

async function resolveOptionsChain(
  underlying: string
): Promise<OptionsChainResponse> {
  const cleanUnderlying = normalizeUnderlying(underlying);

  if (!cleanUnderlying) {
    throw new Error("Código do ativo base é obrigatório.");
  }

  getUnderlyingRoot(cleanUnderlying);

  const cacheFileName = `options_chain_${cleanUnderlying}.json`;
  const cached = await readJsonCache<OptionsChainResponse>(cacheFileName);

  /*
    Não reutiliza a cadeia manual antiga de 4 ou 9 opções.
    Só considera válido um cache com uma quantidade minimamente plausível.
  */
  if (
    isUsefulCache(cached) &&
    isCacheFresh(cached.updatedAt, CACHE_MINUTES)
  ) {
    return {
      ...cached,
      source: "cache" as OptionsChainResponse["source"],
      cached: true,
    };
  }

  try {
    const options = await scrapeOptionsChain(cleanUnderlying);

    if (options.length === 0) {
      throw new Error(
        `O scraping não encontrou opções disponíveis para ${cleanUnderlying}.`
      );
    }

    const result: OptionsChainResponse = {
      underlying: cleanUnderlying,
      source: SOURCE_NAME as OptionsChainResponse["source"],
      cached: false,
      updatedAt: new Date().toISOString(),
      options,
    };

    await writeJsonCache(cacheFileName, result);

    return result;
  } catch (error) {
    /*
      Se o site estiver temporariamente indisponível, devolve o último cache
      completo, mesmo vencido. Isso evita derrubar a calculadora.
    */
    if (isUsefulCache(cached)) {
      return {
        ...cached,
        source: "cache" as OptionsChainResponse["source"],
        cached: true,
      };
    }

    throw error;
  }
}

export async function getOptionsChain(
  underlying: string
): Promise<OptionsChainResponse> {
  const cleanUnderlying = normalizeUnderlying(underlying);
  const pending = pendingChainLookups.get(cleanUnderlying);

  if (pending) {
    return pending;
  }

  const lookup = resolveOptionsChain(cleanUnderlying).finally(() => {
    pendingChainLookups.delete(cleanUnderlying);
  });

  pendingChainLookups.set(cleanUnderlying, lookup);

  return lookup;
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
