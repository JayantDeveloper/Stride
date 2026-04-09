import("./server.mjs")
  .then(({ start }) => start())
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
