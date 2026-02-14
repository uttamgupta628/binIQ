const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const categorySchema = new mongoose.Schema({
  _id: { type: String, default: uuidv4 },
  category_name: { type: String, required: true, unique: true },
  created_at: { type: Date, default: Date.now },
});

// categorySchema.index({ category_name: 1 }, { unique: true });

module.exports = mongoose.model('ProductCategory', categorySchema);