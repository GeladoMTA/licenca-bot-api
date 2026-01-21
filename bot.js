import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import { nanoid } from "nanoid";
import { db } from "./db.js";

function isAdmin(i, adminRoleId) {
  return i.member?.roles?.cache?.has(adminRoleId);
}

export async function startBot({ token, clientId, guildId, adminRoleId }) {
  const commands = [
    new SlashCommandBuilder()
      .setName("key")
      .setDescription("Gerenciar licenças")
      .addSubcommand(sc =>
        sc.setName("create")
          .setDescription("Cria uma key")
          .addIntegerOption(o => o.setName("days").setDescription("Validade em dias").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("info")
          .setDescription("Info da key")
          .addStringOption(o => o.setName("key").setDescription("Key").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("extend")
          .setDescription("Estende a validade")
          .addStringOption(o => o.setName("key").setDescription("Key").setRequired(true))
          .addIntegerOption(o => o.setName("days").setDescription("Dias a adicionar").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("ban")
          .setDescription("Bane a key")
          .addStringOption(o => o.setName("key").setDescription("Key").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("reset-hwid")
          .setDescription("Reseta HWID (desvincula PC)")
          .addStringOption(o => o.setName("key").setDescription("Key").setRequired(true))
      )
      .addSubcommand(sc =>
        sc.setName("list")
          .setDescription("Lista keys (ativas/banidas/expiradas)")
          .addStringOption(o =>
            o.setName("status")
              .setDescription("Filtrar por status")
              .addChoices(
                { name: "active", value: "active" },
                { name: "banned", value: "banned" },
                { name: "expired", value: "expired" }
              )
              .setRequired(false)
          )
          .addIntegerOption(o =>
            o.setName("limit")
              .setDescription("Quantidade (1-20)")
              .setMinValue(1)
              .setMaxValue(20)
              .setRequired(false)
          )
      )
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    if (i.commandName !== "key") return;

    if (!isAdmin(i, adminRoleId)) {
      return i.reply({ content: "Sem permissão.", ephemeral: true });
    }

    const sub = i.options.getSubcommand();

    if (sub === "create") {
      const days = i.options.getInteger("days");
      const key = nanoid(20).toUpperCase();
      const expires = new Date(Date.now() + days * 86400000).toISOString();

      db.prepare("INSERT INTO licenses(key, expires_at, status) VALUES(?,?, 'active')")
        .run(key, expires);

      return i.reply({ content: `✅ Key criada:\n\`${key}\`\nExpira: **${expires}**`, ephemeral: true });
    }

    if (sub === "info") {
      const key = i.options.getString("key").trim();
      const row = db.prepare("SELECT key, expires_at, status, hwid, reset_count FROM licenses WHERE key=?").get(key);
      if (!row) return i.reply({ content: "Key não encontrada.", ephemeral: true });

      return i.reply({
        content:
          `🔎 \`${row.key}\`\n` +
          `Status: **${row.status}**\n` +
          `Expira: **${row.expires_at}**\n` +
          `HWID: ${row.hwid ? "`" + row.hwid.slice(0, 12) + "...`" : "**(não vinculado)**"}\n` +
          `Resets: **${row.reset_count}**`,
        ephemeral: true
      });
    }

    if (sub === "extend") {
      const key = i.options.getString("key").trim();
      const days = i.options.getInteger("days");

      const row = db.prepare("SELECT expires_at FROM licenses WHERE key=?").get(key);
      if (!row) return i.reply({ content: "Key não encontrada.", ephemeral: true });

      const newExp = new Date(Date.parse(row.expires_at) + days * 86400000).toISOString();
      db.prepare("UPDATE licenses SET expires_at=? WHERE key=?").run(newExp, key);

      return i.reply({ content: `⏳ Validade estendida em ${days} dias.\nNova expiração: **${newExp}**`, ephemeral: true });
    }

    if (sub === "ban") {
      const key = i.options.getString("key").trim();
      db.prepare("UPDATE licenses SET status='banned' WHERE key=?").run(key);
      return i.reply({ content: `⛔ Key banida: \`${key}\``, ephemeral: true });
    }

    if (sub === "reset-hwid") {
      const key = i.options.getString("key").trim();
      db.prepare(`
        UPDATE licenses
        SET hwid=NULL, bound_at=NULL, reset_count=reset_count+1, reset_last_at=datetime('now')
        WHERE key=?
      `).run(key);
      return i.reply({ content: `🔄 HWID resetado: \`${key}\``, ephemeral: true });
    }

    if (sub === "list") {
      const status = i.options.getString("status") || "active";
      const limit = i.options.getInteger("limit") || 10;

      const nowIso = new Date().toISOString();
      let rows = [];

      if (status === "expired") {
        rows = db.prepare(`
          SELECT key, expires_at, status, hwid
          FROM licenses
          WHERE expires_at < ?
          ORDER BY expires_at DESC
          LIMIT ?
        `).all(nowIso, limit);
      } else {
        rows = db.prepare(`
          SELECT key, expires_at, status, hwid
          FROM licenses
          WHERE status = ?
          ORDER BY expires_at ASC
          LIMIT ?
        `).all(status, limit);
      }

      if (!rows.length) {
        return i.reply({ content: "Nenhuma key encontrada nesse filtro.", ephemeral: true });
      }

      const lines = rows.map((r, idx) => {
        const bound = r.hwid ? "✅ vinculada" : "⚪ livre";
        const shortKey = r.key.length > 12 ? `${r.key.slice(0, 6)}...${r.key.slice(-4)}` : r.key;
        return `${idx + 1}. \`${shortKey}\` | expira: **${r.expires_at}** | ${bound} | status: **${r.status}**`;
      });

      return i.reply({
        content: `📋 Keys **${status}** (mostrando ${rows.length}/${limit}):\n` + lines.join("\n"),
        ephemeral: true
      });
    }
  });

  await client.login(token);
  console.log("Bot online");
}
