import type { Request, Response } from "express";

import { getOptionHistory } from "../services/options/optionHistoryService";

import type { OptionHistoryRange } from "../services/options/optionHistoryTypes";

function isValidOptionHistoryRange(
  range: string
): range is OptionHistoryRange {
  return range === "1w" || range === "1m" || range === "1y";
}

export async function getOptionHistoryController(
  req: Request,
  res: Response
) {
  try {
    const optionSymbol = String(req.params.optionSymbol ?? "")
      .trim()
      .toUpperCase();

    const rangeParam = String(req.query.range ?? "1m");

    if (!optionSymbol) {
      return res.status(400).json({
        error: "Código da opção é obrigatório.",
      });
    }

    if (!isValidOptionHistoryRange(rangeParam)) {
      return res.status(400).json({
        error: "Range inválido. Use 1w, 1m ou 1y.",
      });
    }

    const history = await getOptionHistory(optionSymbol, rangeParam);

    return res.json(history);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erro ao buscar histórico da opção.",
    });
  }
}