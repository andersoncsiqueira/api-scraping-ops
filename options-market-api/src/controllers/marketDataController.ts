import type { Request, Response } from "express";
import type { HistoryRange, MarketEvent } from "../types/marketData";

import {
  getYahooHistory,
  getYahooQuote,
} from "../services/yahooHistoryService";

function isValidRange(range: string): range is HistoryRange {
  return range === "1w" || range === "1m" || range === "1y";
}

export async function getMarketHistoryController(
  req: Request,
  res: Response
) {
  try {
    const symbol = String(req.params.symbol ?? "").trim().toUpperCase();
    const rangeParam = String(req.query.range ?? "1y");

    if (!symbol) {
      return res.status(400).json({
        error: "Código do ativo é obrigatório.",
      });
    }

    if (!isValidRange(rangeParam)) {
      return res.status(400).json({
        error: "Range inválido. Use 1w, 1m ou 1y.",
      });
    }

    const history = await getYahooHistory(symbol, rangeParam);

    return res.json(history);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erro ao buscar histórico do ativo.",
    });
  }
}

export async function getMarketQuoteController(req: Request, res: Response) {
  try {
    const symbol = String(req.params.symbol ?? "").trim().toUpperCase();

    if (!symbol) {
      return res.status(400).json({
        error: "Código do ativo é obrigatório.",
      });
    }

    const quote = await getYahooQuote(symbol);

    return res.json(quote);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erro ao buscar cotação do ativo.",
    });
  }
}

export async function getMarketEventsController(req: Request, res: Response) {
  try {
    const symbol = String(req.params.symbol ?? "").trim().toUpperCase();

    if (!symbol) {
      return res.status(400).json({
        error: "Código do ativo é obrigatório.",
      });
    }

    const today = new Date();

    const events: MarketEvent[] = [
      {
        id: "1",
        symbol,
        date: new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + 5
        )
          .toISOString()
          .slice(0, 10),
        title: "Vencimento de opções",
        type: "options",
        description:
          "Data aproximada para acompanhar vencimentos de opções do ativo.",
      },
      {
        id: "2",
        symbol,
        date: new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + 12
        )
          .toISOString()
          .slice(0, 10),
        title: "Possível evento de proventos",
        type: "dividend",
        description:
          "Acompanhar data-com, data-ex, dividendos e JCP divulgados pela empresa.",
      },
      {
        id: "3",
        symbol,
        date: new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + 20
        )
          .toISOString()
          .slice(0, 10),
        title: "Resultado / balanço",
        type: "earnings",
        description:
          "Resultados financeiros podem alterar preço, volatilidade e prêmio das opções.",
      },
      {
        id: "4",
        symbol,
        date: new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() + 30
        )
          .toISOString()
          .slice(0, 10),
        title: "Revisar volatilidade",
        type: "event",
        description:
          "Comparar volatilidade histórica do ativo com volatilidade implícita das opções.",
      },
    ];

    return res.json({
      symbol,
      source: "manual",
      cached: false,
      updatedAt: new Date().toISOString(),
      events,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erro ao buscar eventos do ativo.",
    });
  }
}