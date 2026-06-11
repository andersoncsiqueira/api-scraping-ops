import type { Request, Response } from "express";

import { getOptionBySymbol } from "../services/options/optionScraperService";

export async function getOptionBySymbolController(
  req: Request,
  res: Response
) {
  try {
    const optionSymbol = String(req.params.optionSymbol ?? "")
      .trim()
      .toUpperCase();

    if (!optionSymbol) {
      return res.status(400).json({
        error: "Código da opção é obrigatório.",
      });
    }

    const option = await getOptionBySymbol(optionSymbol);

    return res.json(option);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erro ao buscar dados da opção.",
    });
  }
}