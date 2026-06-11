import { Router } from "express";

import { getOptionsChainController } from "../controllers/optionsChainController";

const optionsChainRoutes = Router();

optionsChainRoutes.get("/:underlying", getOptionsChainController);

export default optionsChainRoutes;