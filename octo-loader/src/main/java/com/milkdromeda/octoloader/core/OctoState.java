package com.milkdromeda.octoloader.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Persistent per-file resolution cache ({@code octoloader/.octo-state.json}) so that
 * every game start doesn't re-query Modrinth for jars that were already handled.
 * Keyed by the jar's SHA-1.
 */
public final class OctoState {

    public record Entry(String statusKey, String detail, String stagedFile, String when) {
    }

    private final Path file;
    private final Map<String, Entry> entries = new LinkedHashMap<>();

    private OctoState(Path file) {
        this.file = file;
    }

    public static OctoState load(Path file) {
        OctoState state = new OctoState(file);
        try {
            if (Files.exists(file)) {
                Map<String, Object> root = Json.parseObject(Files.readString(file, StandardCharsets.UTF_8));
                for (Map.Entry<String, Object> e : root.entrySet()) {
                    if (e.getValue() instanceof Map<?, ?>) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> m = (Map<String, Object>) e.getValue();
                        state.entries.put(e.getKey(), new Entry(
                                Json.str(m, "status", null),
                                Json.str(m, "detail", ""),
                                Json.str(m, "staged", null),
                                Json.str(m, "when", null)));
                    }
                }
            }
        } catch (IOException | RuntimeException ignored) {
            // A corrupt cache simply means we re-resolve everything.
        }
        return state;
    }

    public Entry get(String sha1) {
        return entries.get(sha1);
    }

    public void put(String sha1, Resolution r) {
        entries.put(sha1, new Entry(
                r.status.key,
                r.detail,
                r.stagedFile == null ? null : r.stagedFile.toString(),
                Instant.now().toString()));
    }

    public void save() throws IOException {
        Map<String, Object> root = new LinkedHashMap<>();
        for (Map.Entry<String, Entry> e : entries.entrySet()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("status", e.getValue().statusKey());
            m.put("detail", e.getValue().detail());
            m.put("staged", e.getValue().stagedFile());
            m.put("when", e.getValue().when());
            root.put(e.getKey(), m);
        }
        Files.createDirectories(file.getParent());
        Files.writeString(file, Json.write(root) + "\n", StandardCharsets.UTF_8);
    }
}
