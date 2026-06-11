import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import marketDataRoutes from "./routes/marketDataRoutes";
import optionsRoutes from "./routes/optionsRoutes";
import optionsChainRoutes from "./routes/optionsChainRoutes";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  return res.json({
    ok: true,
    name: "options-market-api",
    updatedAt: new Date().toISOString(),
  });
});

app.use("/api/market-data", marketDataRoutes);
app.use("/api/options", optionsRoutes);
app.use("/api/options-chain", optionsChainRoutes);

app.listen(PORT, () => {
  console.log(`Options Market API rodando na porta ${PORT}`);
});