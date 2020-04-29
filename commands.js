const Preferences = require("./models/Preferences");

const commands = [
  {
    command: "start",
    description: "Iniciar bot",
  },
  {
    command: "settings",
    description: "Preferencias",
  },
  {
    command: "help",
    description: "Ayuda",
  },
  {
    command: "add",
    description: "Agregar alerta",
  },
];

const startCommandHandler = async (ctx) => {
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
    ctx.reply(`Te avisaré si hay algún producto en ${baseUrl} que te interese`);
  } catch (err) {
    console.log(err.stack);
  }
};

const helpCommandHandler = (ctx) => {
  ctx.reply(
    "Soy un bot que te puede informar sobre la disponibilidad de determinados productos en el sitio Tuenvio"
  );
  ctx.reply("Cada 10 minutos reviso el sitio");
  ctx.reply("Puedes cambiar las preferencias con /settings");
};

const addCommandHandler = (ctx) => ctx.scene.enter("create_alert");

(module.exports = [commands, startCommandHandler, helpCommandHandler]),
  addCommandHandler;
