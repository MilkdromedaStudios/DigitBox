package com.milkdromeda.octoloader.core;

import java.nio.file.Path;

/** Everything Octo Loader learned about one jar in the inbox. */
public record ModJarInfo(
        Path path,
        LoaderType loader,
        String modId,
        String name,
        String version,
        String declaredMcVersion,
        String sha1,
        String sha512
) {
    public String displayName() {
        if (name != null && !name.isBlank()) {
            return name;
        }
        if (modId != null && !modId.isBlank()) {
            return modId;
        }
        return path.getFileName().toString();
    }
}
