const mongoose = require('mongoose');

let memoryServer = null;

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      await mongoose.connect(uri);
      console.log('MongoDB connected:', uri.replace(/\/\/([^@]+)@/, '//***@'));
      return { uri, memory: false };
    } catch (err) {
      console.warn('MONGODB_URI failed:', err.message);
      if (process.env.NODE_ENV === 'production') throw err;
      console.warn('Falling back to in-memory MongoDB for local demo…');
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('MONGODB_URI is required in production');
  }

  const { MongoMemoryServer } = require('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
  const memUri = memoryServer.getUri('khata');
  await mongoose.connect(memUri);
  console.log('In-memory MongoDB ready (set MONGODB_URI for Atlas/local persistence)');
  return { uri: memUri, memory: true };
}

async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = { connectDB, disconnectDB };
