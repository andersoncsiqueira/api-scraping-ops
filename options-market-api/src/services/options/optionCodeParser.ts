import type { OptionType, ParsedOptionCode } from "./optionTypes";

const CALL_MONTHS: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  I: 9,
  J: 10,
  K: 11,
  L: 12,
};

const PUT_MONTHS: Record<string, number> = {
  M: 1,
  N: 2,
  O: 3,
  P: 4,
  Q: 5,
  R: 6,
  S: 7,
  T: 8,
  U: 9,
  V: 10,
  W: 11,
  X: 12,
};

const MONTH_NAMES = [
  "",
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const OPTION_ROOT_TO_UNDERLYING: Record<string, string> = {
  PETR: "PETR4",
  VALE: "VALE3",
  ITUB: "ITUB4",
  BBDC: "BBDC4",
  BBAS: "BBAS3",
  ABEV: "ABEV3",
  WEGE: "WEGE3",
  B3SA: "B3SA3",
  MGLU: "MGLU3",
  PRIO: "PRIO3",
  RENT: "RENT3",
  LREN: "LREN3",
  ELET: "ELET3",
  CMIG: "CMIG4",
  GGBR: "GGBR4",
  CSNA: "CSNA3",
  USIM: "USIM5",
};

function getOptionType(seriesLetter: string): OptionType {
  if (CALL_MONTHS[seriesLetter]) return "CALL";
  if (PUT_MONTHS[seriesLetter]) return "PUT";

  throw new Error(`Letra de série inválida: ${seriesLetter}`);
}

function getExpirationMonth(seriesLetter: string): number {
  return CALL_MONTHS[seriesLetter] ?? PUT_MONTHS[seriesLetter] ?? 0;
}

function getThirdFriday(year: number, month: number): Date {
  const date = new Date(year, month - 1, 1);

  let fridayCount = 0;

  while (date.getMonth() === month - 1) {
    if (date.getDay() === 5) {
      fridayCount += 1;

      if (fridayCount === 3) {
        return new Date(date);
      }
    }

    date.setDate(date.getDate() + 1);
  }

  throw new Error("Não foi possível calcular a terceira sexta-feira.");
}

function estimateExpirationDate(month: number): string {
  const today = new Date();

  let year = today.getFullYear();

  let expiration = getThirdFriday(year, month);

  const todayWithoutTime = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  if (expiration < todayWithoutTime) {
    year += 1;
    expiration = getThirdFriday(year, month);
  }

  return expiration.toISOString().slice(0, 10);
}

function splitOptionCode(symbol: string) {
  const cleanSymbol = symbol.trim().toUpperCase();

  const match = cleanSymbol.match(/^([A-Z]{4})([A-X])([0-9A-Z]+)$/);

  if (!match) {
    throw new Error(
      "Código de opção inválido. Exemplo esperado: PETRF419."
    );
  }

  const [, root, seriesLetter, codeNumber] = match;

  return {
    symbol: cleanSymbol,
    root,
    seriesLetter,
    codeNumber,
  };
}

export function parseBrazilianOptionCode(symbol: string): ParsedOptionCode {
  const { symbol: cleanSymbol, root, seriesLetter, codeNumber } =
    splitOptionCode(symbol);

  const type = getOptionType(seriesLetter);
  const expirationMonth = getExpirationMonth(seriesLetter);

  if (!expirationMonth) {
    throw new Error(`Mês de vencimento inválido para ${cleanSymbol}.`);
  }

  const underlying = OPTION_ROOT_TO_UNDERLYING[root] ?? `${root}4`;

  return {
    symbol: cleanSymbol,
    root,
    underlying,
    seriesLetter,
    codeNumber,
    type,
    expirationMonth,
    expirationMonthName: MONTH_NAMES[expirationMonth],
    estimatedExpiration: estimateExpirationDate(expirationMonth),
    expirationEstimated: true,
  };
}