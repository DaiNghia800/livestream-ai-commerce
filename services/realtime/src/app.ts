import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { config } from "./config.js";
import { createPresenceRouter } from "./modules/presence/presence.routes.js";
import { IPresenceRepository } from "./modules/presence/presence.types.js";
import { createLikesRouter } from "./modules/likes/likes.routes.js";
import { ILikesRepository } from "./modules/likes/likes.types.js";

export function createApp(
  customPresenceRepository?: IPresenceRepository,
  customLikesRepository?:
    | ILikesRepository
    | ((req: Request, res: Response, next: NextFunction) => void),
  extraMiddleware?: (req: Request, res: Response, next: NextFunction) => void
): Express {
  const app = express();

  let likesRepo: ILikesRepository | undefined;
  let middleware = extraMiddleware;

  if (typeof customLikesRepository === "function") {
    middleware = customLikesRepository;
  } else {
    likesRepo = customLikesRepository;
  }

  app.use(
    cors({
      origin: config.corsOrigin === "*" ? true : config.corsOrigin,
      credentials: true,
    })
  );

  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      service: "realtime",
      timestamp: new Date().toISOString(),
    });
  });

  // Realtime Presence router
  const presenceRouter = createPresenceRouter(customPresenceRepository);
  app.use("/api/v1/realtime", presenceRouter);

  // Realtime Likes router
  const likesRouter = createLikesRouter(likesRepo);
  app.use("/api/v1/realtime", likesRouter);

  if (middleware) {
    app.use(middleware);
  }

  // Global Error Handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[RealtimeApp] Unhandled error:", err);
    res.status(500).json({
      error: "InternalServerError",
      message: "An unexpected error occurred",
    });
  });

  return app;
}
