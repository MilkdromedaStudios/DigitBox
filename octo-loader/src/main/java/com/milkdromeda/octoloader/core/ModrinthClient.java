package com.milkdromeda.octoloader.core;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Thin client for the Modrinth v2 API (<a href="https://docs.modrinth.com/api">docs</a>).
 * This is Octo Loader's bridge to "APIs from different versions": given any mod file's
 * hash, Modrinth can tell us which project it belongs to and hand back the build of that
 * project matching a different game version and loader.
 */
public final class ModrinthClient {
    public static final String API = "https://api.modrinth.com/v2";

    private final HttpClient http;
    private final String userAgent;

    public ModrinthClient(String modVersion) {
        this.http = HttpClient.newBuilder()
                // HTTP/1.1 on purpose: HTTP/2 CONNECT tunnels break behind many
                // corporate/school proxies, and mod downloads gain nothing from h2.
                .version(HttpClient.Version.HTTP_1_1)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(20))
                .build();
        this.userAgent = "MilkdromedaStudios/DigitBox/octo-loader/" + modVersion + " (octo-loader mod)";
    }

    public record ModFile(String url, String filename, boolean primary, String sha512, long size) {
    }

    public record Dependency(String projectId, String versionId, String type) {
    }

    public record Version(
            String id,
            String projectId,
            String versionNumber,
            String versionType,
            List<String> gameVersions,
            List<String> loaders,
            List<ModFile> files,
            List<Dependency> dependencies
    ) {
        public Optional<ModFile> primaryFile() {
            return files.stream().filter(ModFile::primary).findFirst()
                    .or(() -> files.stream().filter(f -> f.filename().endsWith(".jar")).findFirst())
                    .or(() -> files.stream().findFirst());
        }
    }

    public record Project(String id, String slug, String title, List<String> loaders, List<String> gameVersions) {
    }

    public record SearchHit(String projectId, String slug, String title) {
    }

    // ---- lookups -----------------------------------------------------------

    /**
     * Identifies which Modrinth project/version a local file belongs to, by its SHA-1.
     * Combined with {@link #projectVersions}, this is the whole cross-version /
     * cross-loader bridge: hash → project → the project's build for the game version
     * and loader we actually need.
     */
    public Optional<Version> versionByHash(String sha1) throws IOException {
        Object body = get("/version_file/" + sha1 + "?algorithm=sha1");
        return body instanceof Map<?, ?> ? Optional.of(parseVersion(cast(body))) : Optional.empty();
    }

    public Optional<Project> project(String idOrSlug) throws IOException {
        Object body = get("/project/" + urlEncode(idOrSlug));
        if (!(body instanceof Map<?, ?>)) {
            return Optional.empty();
        }
        Map<String, Object> m = cast(body);
        return Optional.of(new Project(
                Json.str(m, "id", null),
                Json.str(m, "slug", null),
                Json.str(m, "title", null),
                Json.strings(m, "loaders"),
                Json.strings(m, "game_versions")));
    }

    /** Lists a project's versions, optionally filtered by loader and/or game version. */
    public List<Version> projectVersions(String idOrSlug, String loader, String gameVersion) throws IOException {
        StringBuilder q = new StringBuilder("/project/" + urlEncode(idOrSlug) + "/version");
        char sep = '?';
        if (loader != null) {
            q.append(sep).append("loaders=").append(urlEncode("[\"" + loader + "\"]"));
            sep = '&';
        }
        if (gameVersion != null) {
            q.append(sep).append("game_versions=").append(urlEncode("[\"" + gameVersion + "\"]"));
        }
        Object body = get(q.toString());
        List<Version> out = new ArrayList<>();
        if (body instanceof List<?> l) {
            for (Object o : l) {
                if (o instanceof Map<?, ?>) {
                    out.add(parseVersion(cast(o)));
                }
            }
        }
        return out;
    }

    public Optional<Version> version(String versionId) throws IOException {
        Object body = get("/version/" + urlEncode(versionId));
        return body instanceof Map<?, ?> ? Optional.of(parseVersion(cast(body))) : Optional.empty();
    }

    /** Search projects; loader/game version facets are optional filters. */
    public List<SearchHit> search(String query, String loader, String gameVersion, int limit) throws IOException {
        List<Object> facets = new ArrayList<>();
        if (loader != null) {
            facets.add(List.of("categories:" + loader));
        }
        if (gameVersion != null) {
            facets.add(List.of("versions:" + gameVersion));
        }
        String url = "/search?query=" + urlEncode(query)
                + "&limit=" + limit
                + (facets.isEmpty() ? "" : "&facets=" + urlEncode(Json.write(facets).replaceAll("\\s", "")));
        Object body = get(url);
        List<SearchHit> hits = new ArrayList<>();
        if (body instanceof Map<?, ?>) {
            for (Object o : Json.arr(cast(body), "hits")) {
                if (o instanceof Map<?, ?>) {
                    Map<String, Object> h = cast(o);
                    hits.add(new SearchHit(
                            Json.str(h, "project_id", null),
                            Json.str(h, "slug", null),
                            Json.str(h, "title", null)));
                }
            }
        }
        return hits;
    }

    /** Downloads a version's primary file into {@code destDir}, verifying its SHA-512. */
    public Path download(Version version, Path destDir) throws IOException {
        ModFile file = version.primaryFile()
                .orElseThrow(() -> new IOException("Version " + version.id() + " has no files"));
        Files.createDirectories(destDir);
        Path dest = destDir.resolve(file.filename());
        if (Files.exists(dest)) {
            return dest;
        }
        Path tmp = destDir.resolve(file.filename() + ".octo-part");
        HttpRequest req = HttpRequest.newBuilder(URI.create(file.url()))
                .header("User-Agent", userAgent)
                .timeout(Duration.ofMinutes(5))
                .build();
        try {
            HttpResponse<InputStream> resp = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
            if (resp.statusCode() != 200) {
                throw new IOException("Download failed with HTTP " + resp.statusCode() + ": " + file.url());
            }
            try (InputStream in = resp.body()) {
                Files.copy(in, tmp, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Download interrupted", e);
        }
        if (file.sha512() != null && !file.sha512().isBlank()) {
            String actual = sha512(tmp);
            if (!actual.equalsIgnoreCase(file.sha512())) {
                Files.deleteIfExists(tmp);
                throw new IOException("SHA-512 mismatch for " + file.filename());
            }
        }
        Files.move(tmp, dest, StandardCopyOption.REPLACE_EXISTING);
        return dest;
    }

    // ---- plumbing ----------------------------------------------------------

    private Object get(String path) throws IOException {
        HttpRequest req = HttpRequest.newBuilder(URI.create(API + path))
                .header("User-Agent", userAgent)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(30))
                .GET()
                .build();
        return send(req);
    }

    private static final long[] RETRY_DELAYS_MS = {2000L, 5000L, 10000L};

    /** Sends with up to four attempts: rate limits and transient 5xx are retried with backoff. */
    private Object send(HttpRequest req) throws IOException {
        IOException last = null;
        for (int attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
            try {
                HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                int code = resp.statusCode();
                if (code == 404 || code == 410) {
                    return null;
                }
                if (code == 429 || code >= 500) {
                    last = new IOException("Modrinth API returned HTTP " + code + " for " + req.uri());
                } else if (code < 200 || code >= 300) {
                    throw new IOException("Modrinth API returned HTTP " + code + " for " + req.uri());
                } else {
                    String text = resp.body();
                    return text == null || text.isBlank() ? null : Json.parse(text);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("Request interrupted", e);
            } catch (IOException e) {
                last = e;
            }
            if (attempt <= RETRY_DELAYS_MS.length) {
                try {
                    Thread.sleep(RETRY_DELAYS_MS[attempt - 1]);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException("Request interrupted", e);
                }
            }
        }
        throw last;
    }

    private static Version parseVersion(Map<String, Object> m) {
        List<ModFile> files = new ArrayList<>();
        for (Object o : Json.arr(m, "files")) {
            if (o instanceof Map<?, ?>) {
                Map<String, Object> f = cast(o);
                Map<String, Object> hashes = Json.obj(f, "hashes");
                files.add(new ModFile(
                        Json.str(f, "url", null),
                        Json.str(f, "filename", null),
                        Json.bool(f, "primary", false),
                        Json.str(hashes, "sha512", null),
                        Json.integer(f, "size", 0)));
            }
        }
        List<Dependency> deps = new ArrayList<>();
        for (Object o : Json.arr(m, "dependencies")) {
            if (o instanceof Map<?, ?>) {
                Map<String, Object> d = cast(o);
                deps.add(new Dependency(
                        Json.str(d, "project_id", null),
                        Json.str(d, "version_id", null),
                        Json.str(d, "dependency_type", "optional")));
            }
        }
        return new Version(
                Json.str(m, "id", null),
                Json.str(m, "project_id", null),
                Json.str(m, "version_number", null),
                Json.str(m, "version_type", "release"),
                Json.strings(m, "game_versions"),
                Json.strings(m, "loaders"),
                files,
                deps);
    }

    private static String sha512(Path file) throws IOException {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-512");
            try (InputStream in = Files.newInputStream(file)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    md.update(buf, 0, n);
                }
            }
            return JarClassifier.toHex(md.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String urlEncode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> cast(Object o) {
        return (Map<String, Object>) o;
    }
}
