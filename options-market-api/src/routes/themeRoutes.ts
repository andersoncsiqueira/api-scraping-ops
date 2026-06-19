import { Router } from "express";

import { getThemeController } from "../controllers/themeController";

const themeRoutes = Router();

themeRoutes.get("/", getThemeController);

export default themeRoutes;
