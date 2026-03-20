import "dotenv/config";
import cors from "cors";
import express from "express";
import { apiRouter } from "./routes/api.js";

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
});
