const mongoose = require("mongoose");

let isConnected = false;
let memoryServer = null;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const mongoUri = process.env.MONGODB_URI ? process.env.MONGODB_URI.trim() : "";
  const optInMemory = process.env.USE_IN_MEMORY_DB === "true" || process.env.NODE_ENV === "test";

  if (mongoUri) {
    try {
      // Safe sanitized URI logging without credentials
      const sanitizedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");
      console.log(`Connecting to MongoDB at: ${sanitizedUri}`);
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000,
      });
      isConnected = true;
      console.log("✓ Connected to persistent MongoDB successfully.");
      return mongoose.connection;
    } catch (err) {
      console.error(`❌ Could not connect to configured MongoDB URI (${err.message}).`);
      throw new Error(
        `MongoDB connection failed: Could not connect to configured MongoDB URI (${err.message}). Please ensure your local MongoDB service is running (e.g., 'net start MongoDB' or 'mongod') and that MONGODB_URI in .env is accessible.`
      );
    }
  }

  // If MONGODB_URI is not provided, only start embedded memory server if explicitly opted-in
  if (optInMemory) {
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");
      console.log("ℹ Opt-in in-memory mode active (USE_IN_MEMORY_DB=true). Starting embedded MongoDB instance...");
      memoryServer = await MongoMemoryServer.create({
        instance: {
          dbName: "seatwise_dev",
        },
      });
      const uri = memoryServer.getUri();
      await mongoose.connect(uri);
      isConnected = true;
      console.log(`✓ Embedded in-memory MongoDB connected at: ${uri}`);
      return mongoose.connection;
    } catch (memErr) {
      console.error("Failed to start embedded in-memory MongoDB server:", memErr.message);
      throw new Error(
        `Failed to start embedded in-memory MongoDB server: ${memErr.message}`
      );
    }
  }

  // Not configured and not opted-in
  throw new Error(
    "MongoDB connection failed: MONGODB_URI is not configured in .env. Please configure a valid MongoDB URI (e.g., MONGODB_URI=mongodb://localhost:27017/seatwise) or explicitly set USE_IN_MEMORY_DB=true in .env for development evaluation."
  );
}

async function closeDB() {
  if (isConnected || mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

// Graceful process shutdown handling
process.on("SIGINT", async () => {
  await closeDB();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeDB();
  process.exit(0);
});

module.exports = {
  connectDB,
  closeDB,
  getConnection: () => mongoose.connection,
};
