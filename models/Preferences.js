const mongoose = require("mongoose");

const preferencesSchema = new mongoose.Schema({
  chatId: String,
  getNotifications: Boolean,
});

module.exports = mongoose.model("Preferences", preferencesSchema);
