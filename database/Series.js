const mongoose = require('mongoose');

// Create connection to POG database for series data
const pogConnection = mongoose.createConnection(process.env.POG_MONGODB_URI, {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
});

const seriesSchema = new mongoose.Schema({
  hearts: { type: String, required: true },
  series: { type: String, required: true }
}, { 
  collection: 'series',
  strict: false
});

seriesSchema.index({ series: 1 });

module.exports = pogConnection.model('Series', seriesSchema);
