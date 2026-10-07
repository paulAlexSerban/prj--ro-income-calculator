import { buildApp, startScheduler } from "./app.js";
import { config } from "./config.js";

const app = await buildApp();
startScheduler();
await app.listen({ port: config.port, host: "0.0.0.0" });
