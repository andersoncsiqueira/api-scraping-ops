import { Router } from "express";

import { getOptionBySymbolController } from "../controllers/optionsController";
import { getOptionHistoryController } from "../controllers/optionsHistoryController";

const optionsRoutes = Router();

optionsRoutes.get("/:optionSymbol/history", getOptionHistoryController);

optionsRoutes.get("/:optionSymbol", getOptionBySymbolController);

export default optionsRoutes;