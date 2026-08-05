import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import repositoryRoutes from "./routes/repository.routes.js";

const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Health route works!",
  });
});

// Repository Brain API
app.use("/api/repository", repositoryRoutes);

export default app;