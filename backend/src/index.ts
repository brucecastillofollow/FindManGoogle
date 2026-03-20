import "dotenv/config";
import cors from "cors";
import express from "express";
import { runAutomatedSearchOnStartup } from "./automatedSearch.js";
import { getDb } from "./db.js";
import { apiRouter } from "./routes/api.js";

/** Open SQLite and apply schema early so startup fails fast if the DB path is invalid. */
getDb();

const port = Number(process.env.PORT) || 3001;

const allowed = process.env.CORS_ORIGINS?.split(/[\s,]+/).filter(Boolean);

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || !allowed?.length) {
        cb(null, true);
        return;
      }
      if (allowed.includes(origin)) cb(null, true);
      else cb(new Error("Not allowed by CORS"));
    },
  }),
);

app.use("/api", apiRouter);

app.listen(port, () => {
  console.log(`API http://localhost:${port}`);
  // Defer until after listen; see automatedSearch.ts (needs tokens — use GITHUB_TOKENS or POST /api/tokens).
  setTimeout(() => {
    void runAutomatedSearchOnStartup();
  }, 750);
});
