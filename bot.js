const { Telegraf } = require("telegraf");
const Telegram = require("telegraf/telegram");
const TelegrafInlineMenu = require("telegraf-inline-menu");
const events = require("./scraper/events");
const TuenvioScraper = require("./scraper/TuenvioScraper");
const express = require("express");
const mongoose = require("mongoose");
const Preferences = require("./models/Preferences");

(async () => {
  const PORT = process.env.PORT;
  const URL = process.env.URL;
  const DB_URL = process.env.DB_URL;
  const token = process.env.BOT_TOKEN;
  const baseUrl = process.env.BASE_URL;
  const depPids = process.env.DEP_PIDS.split(",");
  const include_terms = process.env.INCLUDE_TERMS.split(",");
  const exclude_terms = process.env.EXCLUDE_TERMS.split(",");
  const bot = new Telegraf(token);
  const telegram = new Telegram(token);
  const expressApp = express();

  mongoose.connect(DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const db = mongoose.connection;
  db.on("error", console.error.bind(console, "MongoDB connection error:"));

  expressApp.use(bot.webhookCallback(`/bot${token}`));
  bot.telegram.setWebhook(`${URL}/bot${token}`);

  bot.start(async (ctx) => {
    try {
      let preferences = await Preferences.findOne({ chatId: ctx.chat.id });
      if (preferences === null) {
        preferences = new Preferences({
          chatId: ctx.chat.id,
          getNotifications: true,
        });
        await preferences.save();
      }
      ctx.reply("Hola");
      ctx.reply(
        `Te avisaré si hay algún producto en ${baseUrl} cuyo nombre contenga ${include_terms.join(
          ", "
        )}, excepto si también contiene ${exclude_terms.join(", ")}`
      );
    } catch (err) {
      console.log(err.stack);
    }
  });

  const stopMenu = new TelegrafInlineMenu(
    `¿Seguro que deseas dejar de recibir notificaciones? ¡Te advierto que no guardaré tus preferencias!`
  );
  stopMenu.setCommand("stop");
  stopMenu.button("✅ Sí", "yes", {
    doFunc: async (ctx) => {
      try {
        await Preferences.deleteOne({ chatId: ctx.chat.id });
        await ctx.reply("😢 Listo. No volveré a enviarte notificaciones.");
        await ctx.reply(
          "Si cambias de opinión siempre puedes volver a comenzar mediante el comando /start"
        );
      } catch (err) {
        console.log(err.stack);
      }
    },
  });
  stopMenu.button("❌ No", "no", {
    doFunc: async (ctx) => {
      try {
        await ctx.reply("😅 Eso estuvo cerca");
      } catch (err) {
        console.log(err.stack);
      }
    },
    joinLastRow: true,
  });
  bot.use(stopMenu.init());

  const settingsMenu = new TelegrafInlineMenu("Preferencias");
  settingsMenu.setCommand("settings");

  settingsMenu.toggle("Notificaciones", "notifications", {
    setFunc: async (ctx, newState) => {
      try {
        await Preferences.updateOne(
          {
            chatId: ctx.chat.id,
          },
          {
            getNotifications: newState,
          }
        );
      } catch (err) {
        console.log(err.stack);
      }
    },
    isSetFunc: async (ctx) => {
      const preferences = await Preferences.findOne({
        chatId: ctx.chat.id,
      });
      return preferences.getNotifications;
    },
  });

  bot.use(
    settingsMenu.init({
      backButtonText: "Volver…",
      mainMenuButtonText: "Volver al menú principal…",
    })
  );

  bot.help((ctx) => {
    ctx.reply(
      "Soy un bot que te puede informar sobre la disponibilidad de determinados productos en el sitio Tuenvio"
    );
    ctx.reply("Cada 10 minutos reviso el sitio");
    ctx.reply("Puedes cambiar las preferencias con /settings");
  });

  setInterval(async () => {
    try {
      const options = {
        timeout: 60000,
      };

      const scraper = new TuenvioScraper(options);
      scraper.on(events.custom.data, async ({ title, url, image, price }) => {
        if (
          include_terms.some((term) =>
            title.toLowerCase().includes(term.toLowerCase())
          ) &&
          exclude_terms.every(
            (term) => !title.toLowerCase().includes(term.toLowerCase())
          )
        ) {
          const allPreferences = await Preferences.find();
          for (const preferences of allPreferences) {
            await telegram.sendMessage(
              preferences.chatId,
              `${title} (${price}) ${url}`
            );
          }
        }
      });
      scraper.on(
        events.custom.error,
        console.error.bind(console, "Scraping error:")
      );
      await scraper.run(baseUrl, depPids);
      await scraper.close();
    } catch (err) {
      console.log(err.stack);
    }
  }, 300000);

  expressApp.get("/", (req, res) => {
    res.send("Hello World!");
  });
  expressApp.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})().catch((err) => console.error(err));
