/**
 * db.js
 * Opens a single Mongoose connection to MongoDB Atlas.
 * Called once from server.js before Express starts listening.
 *
 * Why a separate file?  So models can require('./db') without
 * accidentally opening a second connection.
 */

const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in .env');
  }

  await mongoose.connect(uri);
  console.log('✅  MongoDB connected');

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });
}

module.exports = connectDB;
