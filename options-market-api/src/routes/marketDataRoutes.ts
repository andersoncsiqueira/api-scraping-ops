import { Router } from "express";

import {
  getMarketEventsController,
  getMarketHistoryController,
  getMarketQuoteController,
} from "../controllers/marketDataController";

const marketDataRoutes = Router();

marketDataRoutes.get("/:symbol/quote", getMarketQuoteController);

marketDataRoutes.get("/:symbol/history", getMarketHistoryController);

marketDataRoutes.get("/:symbol/events", getMarketEventsController);

export default marketDataRoutes;