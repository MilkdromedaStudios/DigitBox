package com.milkdromeda.octoloader.cli;

import com.milkdromeda.octoloader.core.OctoConfig;
import com.milkdromeda.octoloader.core.OctoCore;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;

/**
 * Standalone entry point: the same resolution engine that runs in-game, runnable
 * against any instance folder without launching Minecraft. Used by CI to prove the
 * mod works, and handy for preparing a server's mod folder from a shell.
 *
 * <pre>
 *   java -jar octo-loader-x.y.z.jar --dir /path/to/instance --game-version 26.2
 * </pre>
 */
public final class OctoCli {

    private OctoCli() {
    }

    public static void main(String[] args) throws Exception {
        Path dir = Path.of(".");
        String gameVersion = null;
        boolean offline = false;
        boolean force = false;
        boolean update = false;
        String exportName = null;
        boolean export = false;

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--dir", "-d" -> dir = Path.of(args[++i]);
                case "--game-version", "-g" -> gameVersion = args[++i];
                case "--offline" -> offline = true;
                case "--force" -> force = true;
                case "--update", "-u" -> update = true;
                case "--export", "-e" -> {
                    export = true;
                    if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
                        exportName = args[++i];
                    }
                }
                case "--help", "-h" -> {
                    usage();
                    return;
                }
                default -> {
                    System.err.println("Unknown argument: " + args[i]);
                    usage();
                    System.exit(2);
                }
            }
        }
        if (gameVersion == null) {
            System.err.println("--game-version is required (e.g. --game-version 26.2)");
            usage();
            System.exit(2);
        }

        OctoConfig config = OctoConfig.load(dir.resolve("config"));
        config.offline = config.offline || offline;

        if (update) {
            OctoCore.runUpdate(dir.toAbsolutePath().normalize(), gameVersion, config,
                    line -> System.out.println("[octo] " + line));
            return;
        }
        if (export) {
            OctoCore.runExport(dir.toAbsolutePath().normalize(), gameVersion, exportName,
                    line -> System.out.println("[octo] " + line));
            return;
        }

        OctoCore.Summary summary = OctoCore.run(
                dir.toAbsolutePath().normalize(),
                gameVersion,
                config,
                Set.of(),
                true,
                force,
                line -> System.out.println("[octo] " + line));

        System.out.println();
        System.out.println(Files.readString(summary.reportMd()));
    }

    private static void usage() {
        System.out.println("""
                Octo Loader CLI — bridge any mod/plugin jar to Fabric on your game version.

                Usage: java -jar octo-loader.jar [options]
                  --dir, -d <path>           Minecraft instance directory (default: .)
                  --game-version, -g <ver>   Target Minecraft version, e.g. 26.2 (required)
                  --offline                  Classify only, never touch the network
                  --force                    Ignore the resolution cache and re-resolve
                  --update, -u               Update every Fabric mod in mods/ to its newest build
                  --export, -e [name]        Pack mods/, plugins/ and the report into octoloader/export/<name>/
                """);
    }
}
