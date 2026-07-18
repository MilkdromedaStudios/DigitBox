package com.milkdromeda.octoloader;

import com.milkdromeda.octoloader.core.OctoConfig;
import com.milkdromeda.octoloader.core.OctoCore;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.Set;
import java.util.stream.Collectors;

public class OctoLoaderMod implements ModInitializer {
    public static final Logger LOGGER = LoggerFactory.getLogger("octoloader");

    @Override
    public void onInitialize() {
        FabricLoader loader = FabricLoader.getInstance();
        Path gameDir = loader.getGameDir();
        String gameVersion = loader.getModContainer("minecraft")
                .map(c -> c.getMetadata().getVersion().getFriendlyString())
                .orElse(null);
        OctoConfig config = OctoConfig.load(loader.getConfigDir());
        Set<String> loadedIds = loader.getAllMods().stream()
                .map(m -> m.getMetadata().getId())
                .collect(Collectors.toSet());

        OctoCommands.register(gameDir, gameVersion, config, loadedIds);

        LOGGER.info("Octo Loader {} ready — inbox: {} (Minecraft {})",
                OctoCore.OCTO_VERSION, gameDir.resolve("octoloader"), gameVersion);

        if (config.autoResolve) {
            Thread worker = new Thread(() -> {
                try {
                    OctoCore.run(gameDir, gameVersion, config, loadedIds, true, false, LOGGER::info);
                } catch (Exception e) {
                    LOGGER.error("Octo Loader auto-resolve failed", e);
                }
            }, "octoloader-resolver");
            worker.setDaemon(true);
            worker.start();
        }
    }
}
