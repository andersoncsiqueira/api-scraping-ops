import type { Request, Response } from "express";

import { getOptionsChain } from "../services/options/optionsChainService";

export async function getOptionsChainController(req: Request, res: Response) {
  try {
    const underlying = String(req.params.underlying ?? "")
      .trim()
      .toUpperCase();

    if (!underlying) {
      return res.status(400).json({
        error: "Código do ativo base é obrigatório.",
      });
    }

    const chain = await getOptionsChain(underlying);

    return res.json(chain);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erro ao buscar cadeia de opções.",
    });
  }
}