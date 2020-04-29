const TelegrafInlineMenu = require("telegraf-inline-menu");
const Preferences = require("./models/Preferences");

const settingsMenu = new TelegrafInlineMenu("Preferencias");

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

const stopMenu = new TelegrafInlineMenu(
  `¿Seguro que deseas dejar de recibir notificaciones? ¡Te advierto que no guardaré tus preferencias!`
);
stopMenu.button("Continuar", "continue", {
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
settingsMenu.submenu("🛑 Detener servicio", "stop", stopMenu);

const alertsSubmenuOptions = async (ctx) => {
  try {
    const preferences = await Preferences.findOne({ chatId: ctx.chat.id });
    return preferences.alerts.map((alert) => alert.term);
  } catch (err) {
    console.log(err.stack);
  }
};
const alertMenu = new TelegrafInlineMenu(async (ctx) => {
  try {
    const preferences = await Preferences.findOne({ chatId: ctx.chat.id });
    const alert = preferences.alerts.find(
      (alert) => alert.term === ctx.match[1]
    );
    return `Alertar cuando un nombre de producto contenga:\n
*${alert.term}*\n
excepto si también contiene:\n
${alert.exceptions.map((exception) => `- _${exception}_`).join("\n")}`;
  } catch (err) {
    console.log(err.stack);
  }
});
alertMenu.button("Eliminar alerta", "delete", {
  doFunc: async (ctx) => {
    try {
      const preferences = await Preferences.findOne({ chatId: ctx.chat.id });
      preferences.alerts = preferences.alerts.filter(
        (alert) => alert.term !== ctx.match[1]
      );
      preferences.save();
    } catch (err) {
      console.log(err.stack);
    }
  },
  setParentMenuAfter: true,
});

const alertsMenu = new TelegrafInlineMenu("Alertas");
alertsMenu.selectSubmenu("alert", alertsSubmenuOptions, alertMenu);
settingsMenu.submenu("🔔 Alertas", "alerts", alertsMenu);

settingsMenu.setCommand("settings");

module.exports = [settingsMenu];
