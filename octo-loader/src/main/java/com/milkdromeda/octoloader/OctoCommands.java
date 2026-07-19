package com.milkdromeda.octoloader;

import com.milkdromeda.octoloader.core.ModrinthClient;
import com.milkdromeda.octoloader.core.OctoConfig;
import com.milkdromeda.octoloader.core.OctoCore;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * The in-game surface: {@code /octo scan|resolve|fetch|status}. This is deliberately the
 * only class that touches Minecraft classes, so version bumps stay painless.
 */
public final class OctoCommands {

    private static Path gameDir;
    private static String gameVersion;
    private static OctoConfig config;
    private static Set<String> loadedIds;

    private OctoCommands() {
    }

    public static void register(Path gameDirIn, String gameVersionIn, OctoConfig configIn, Set<String> loadedIdsIn) {
        gameDir = gameDirIn;
        gameVersion = gameVersionIn;
        config = configIn;
        loadedIds = loadedIdsIn;

        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) ->
                dispatcher.register(Commands.literal("octo")
                        .requires(Commands.hasPermission(Commands.LEVEL_GAMEMASTERS))
                        .then(Commands.literal("scan")
                                .executes(ctx -> runResolver(ctx, true, false)))
                        .then(Commands.literal("resolve")
                                .executes(ctx -> runResolver(ctx, false, false))
                                .then(Commands.literal("force")
                                        .executes(ctx -> runResolver(ctx, false, true))))
                        .then(Commands.literal("status")
                                .executes(OctoCommands::status))
                        .then(Commands.literal("update")
                                .executes(OctoCommands::update))
                        .then(Commands.literal("export")
                                .executes(ctx -> export(ctx, null))
                                .then(Commands.argument("name", StringArgumentType.word())
                                        .executes(ctx -> export(ctx, StringArgumentType.getString(ctx, "name")))))
                        .then(Commands.literal("fetch")
                                .then(Commands.argument("slug", StringArgumentType.word())
                                        .executes(OctoCommands::fetch)))));
    }

    private static int runResolver(CommandContext<CommandSourceStack> ctx, boolean offlineScan, boolean force) {
        CommandSourceStack source = ctx.getSource();
        reply(source, offlineScan
                ? "Octo Loader: scanning the octoloader/ inbox (offline)…"
                : "Octo Loader: resolving the octoloader/ inbox via Modrinth…");
        Thread worker = new Thread(() -> {
            try {
                OctoConfig cfg = offlineScan ? offlineCopy() : config;
                OctoCore.Summary summary = OctoCore.run(gameDir, gameVersion, cfg, loadedIds,
                        true, force, OctoLoaderMod.LOGGER::info);
                long ok = summary.results().stream().filter(r -> r.stagedFile != null).count();
                OctoLoaderMod.LOGGER.info("Octo Loader: {} jar(s) processed, {} staged (+{} dependencies). "
                                + "Report: {}", summary.results().size(), ok,
                        summary.stagedCount() - ok, summary.reportMd());
            } catch (Exception e) {
                OctoLoaderMod.LOGGER.error("Octo Loader command failed", e);
            }
        }, "octoloader-command");
        worker.setDaemon(true);
        worker.start();
        reply(source, "Octo Loader: running in the background — results go to the log and octoloader/octo-report.md."
                + " Staged mods load after a restart.");
        return 1;
    }

    private static int status(CommandContext<CommandSourceStack> ctx) {
        CommandSourceStack source = ctx.getSource();
        Path report = gameDir.resolve("octoloader").resolve("octo-report.md");
        if (java.nio.file.Files.exists(report)) {
            reply(source, "Octo Loader " + OctoCore.OCTO_VERSION + " on Minecraft " + gameVersion
                    + ". Latest report: " + report);
        } else {
            reply(source, "Octo Loader " + OctoCore.OCTO_VERSION + " on Minecraft " + gameVersion
                    + ". No report yet — drop jars into octoloader/ and run /octo resolve.");
        }
        return 1;
    }

    private static int update(CommandContext<CommandSourceStack> ctx) {
        CommandSourceStack source = ctx.getSource();
        reply(source, "Octo Loader: checking every mod in mods/ for newer " + gameVersion + " builds…");
        Thread worker = new Thread(() -> {
            try {
                OctoCore.runUpdate(gameDir, gameVersion, config, OctoLoaderMod.LOGGER::info);
            } catch (Exception e) {
                OctoLoaderMod.LOGGER.error("Octo Loader update failed", e);
            }
        }, "octoloader-update");
        worker.setDaemon(true);
        worker.start();
        reply(source, "Octo Loader: updater running in the background — results go to the log. "
                + "Replaced jars are backed up to octoloader/backup/.");
        return 1;
    }

    private static int export(CommandContext<CommandSourceStack> ctx, String name) {
        CommandSourceStack source = ctx.getSource();
        try {
            java.nio.file.Path dest = OctoCore.runExport(gameDir, gameVersion, name, OctoLoaderMod.LOGGER::info);
            reply(source, "Octo Loader: packed the whole mod set into " + dest);
        } catch (Exception e) {
            OctoLoaderMod.LOGGER.error("Octo Loader export failed", e);
            reply(source, "Octo Loader: export failed — " + e.getMessage());
        }
        return 1;
    }

    private static int fetch(CommandContext<CommandSourceStack> ctx) {
        CommandSourceStack source = ctx.getSource();
        String slug = StringArgumentType.getString(ctx, "slug");
        reply(source, "Octo Loader: fetching '" + slug + "' for Minecraft " + gameVersion + " from Modrinth…");
        Thread worker = new Thread(() -> {
            try {
                ModrinthClient modrinth = new ModrinthClient(OctoCore.OCTO_VERSION);
                List<ModrinthClient.Version> versions = modrinth.projectVersions(slug, "fabric", gameVersion);
                Optional<ModrinthClient.Version> best = versions.stream()
                        .filter(v -> "release".equals(v.versionType()))
                        .findFirst()
                        .or(() -> versions.stream().findFirst());
                if (best.isEmpty()) {
                    OctoLoaderMod.LOGGER.warn("Octo Loader: '{}' has no Fabric build for {}.", slug, gameVersion);
                    return;
                }
                Path staged = modrinth.download(best.get(), gameDir.resolve("mods"));
                OctoLoaderMod.LOGGER.info("Octo Loader: staged {} ({} {}). Restart to load it.",
                        staged.getFileName(), slug, best.get().versionNumber());
            } catch (Exception e) {
                OctoLoaderMod.LOGGER.error("Octo Loader fetch failed for '{}'", slug, e);
            }
        }, "octoloader-fetch");
        worker.setDaemon(true);
        worker.start();
        return 1;
    }

    private static OctoConfig offlineCopy() {
        OctoConfig copy = new OctoConfig();
        copy.autoResolve = config.autoResolve;
        copy.offline = true;
        copy.includeBetaBuilds = config.includeBetaBuilds;
        copy.targetGameVersion = config.targetGameVersion;
        copy.maxDependencyDepth = config.maxDependencyDepth;
        copy.extraEquivalents.putAll(config.extraEquivalents);
        return copy;
    }

    private static void reply(CommandSourceStack source, String message) {
        source.sendSuccess(() -> Component.literal("[Octo] " + message), false);
    }
}
