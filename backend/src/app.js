import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import playersRoutes from "./routes/players.js";
import tradesRoutes from "./routes/trades.js";
import portfolioRoutes from "./routes/portfolio.js";
import dividendsRoutes from "./routes/dividends.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "jock-exchange-api" });
  });

  app.use("/auth", authRoutes);
  app.use("/players", playersRoutes);
  app.use("/trades", tradesRoutes);
  app.use("/portfolio", portfolioRoutes);
  app.use("/dividends", dividendsRoutes);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
