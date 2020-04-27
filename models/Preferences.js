const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
  term: String,
  exceptions: [String],
});

const preferencesSchema = new mongoose.Schema({
  chatId: String,
  getNotifications: Boolean,
  alerts: [alertSchema],
});

module.exports = mongoose.model("Preferences", preferencesSchema);
