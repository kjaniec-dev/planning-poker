const { createServer } = require("node:http");
const {
  initWebSocketServer,
  shutdown: shutdownRealtime,
} = require("./servers/node/dist/index.js");

const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

let httpServer;
let isShuttingDown = false;

async function startServer() {
  // Use standard next() approach which works for both standalone and non-standalone
  const next = require("next");
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  httpServer = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error("Error handling request:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  // Initialize WebSocket server if in embedded mode
  if (process.env.REALTIME_MODE === "embedded") {
    console.log("✓ Initializing embedded WebSocket server");
    initWebSocketServer(httpServer);
  }

  httpServer.once("error", (err) => {
    console.error("Server error:", err);
    process.exit(1);
  });

  httpServer.listen(port, hostname, () => {
    console.log(`✓ Ready on http://${hostname}:${port}`);
  });
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n✓ Received ${signal}, starting graceful shutdown...`);

  try {
    httpServer.close(() => {
      console.log("✓ HTTP server closed");
    });

    const activeConnections = new Set();
    httpServer.on("connection", (conn) => {
      activeConnections.add(conn);
      conn.on("close", () => {
        activeConnections.delete(conn);
      });
    });

    const connectionTimeout = setTimeout(() => {
      console.log(
        `⚠ Forcing close of ${activeConnections.size} remaining connections`,
      );
      activeConnections.forEach((conn) => conn.destroy());
    }, 30000);

    if (process.env.REALTIME_MODE === "embedded") {
      console.log("✓ Shutting down embedded WebSocket server");
      await shutdownRealtime();
    }

    clearTimeout(connectionTimeout);
    console.log("✓ Graceful shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});