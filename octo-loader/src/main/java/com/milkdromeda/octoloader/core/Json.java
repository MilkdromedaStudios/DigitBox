package com.milkdromeda.octoloader.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal dependency-free JSON parser/writer. Octo Loader's core also runs standalone
 * from the command line (outside the game's classpath), so it cannot rely on the
 * Gson that ships with Minecraft.
 */
public final class Json {
    private final String src;
    private int pos;

    private Json(String src) {
        this.src = src;
    }

    public static Object parse(String text) {
        Json p = new Json(text);
        p.ws();
        Object v = p.value();
        p.ws();
        if (p.pos < p.src.length()) {
            throw new IllegalArgumentException("Trailing content in JSON at offset " + p.pos);
        }
        return v;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseObject(String text) {
        Object v = parse(text);
        if (v instanceof Map<?, ?> m) {
            return (Map<String, Object>) m;
        }
        throw new IllegalArgumentException("Expected a JSON object");
    }

    // ---- typed accessors -------------------------------------------------

    public static String str(Map<String, Object> map, String key, String def) {
        Object v = map.get(key);
        return v instanceof String s ? s : def;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> obj(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    @SuppressWarnings("unchecked")
    public static List<Object> arr(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v instanceof List<?> l ? (List<Object>) l : List.of();
    }

    public static List<String> strings(Map<String, Object> map, String key) {
        List<String> out = new ArrayList<>();
        for (Object o : arr(map, key)) {
            if (o instanceof String s) {
                out.add(s);
            }
        }
        return out;
    }

    public static boolean bool(Map<String, Object> map, String key, boolean def) {
        Object v = map.get(key);
        return v instanceof Boolean b ? b : def;
    }

    public static long integer(Map<String, Object> map, String key, long def) {
        Object v = map.get(key);
        return v instanceof Number n ? n.longValue() : def;
    }

    // ---- parsing ---------------------------------------------------------

    private Object value() {
        if (pos >= src.length()) {
            throw new IllegalArgumentException("Unexpected end of JSON");
        }
        char c = src.charAt(pos);
        return switch (c) {
            case '{' -> object();
            case '[' -> array();
            case '"' -> string();
            case 't', 'f', 'n' -> literal();
            default -> number();
        };
    }

    private Map<String, Object> object() {
        Map<String, Object> map = new LinkedHashMap<>();
        expect('{');
        ws();
        if (peek() == '}') {
            pos++;
            return map;
        }
        while (true) {
            ws();
            String key = string();
            ws();
            expect(':');
            ws();
            map.put(key, value());
            ws();
            char c = next();
            if (c == '}') {
                return map;
            }
            if (c != ',') {
                throw new IllegalArgumentException("Expected ',' or '}' at offset " + (pos - 1));
            }
        }
    }

    private List<Object> array() {
        List<Object> list = new ArrayList<>();
        expect('[');
        ws();
        if (peek() == ']') {
            pos++;
            return list;
        }
        while (true) {
            ws();
            list.add(value());
            ws();
            char c = next();
            if (c == ']') {
                return list;
            }
            if (c != ',') {
                throw new IllegalArgumentException("Expected ',' or ']' at offset " + (pos - 1));
            }
        }
    }

    private String string() {
        expect('"');
        StringBuilder sb = new StringBuilder();
        while (true) {
            char c = next();
            if (c == '"') {
                return sb.toString();
            }
            if (c == '\\') {
                char e = next();
                switch (e) {
                    case '"' -> sb.append('"');
                    case '\\' -> sb.append('\\');
                    case '/' -> sb.append('/');
                    case 'b' -> sb.append('\b');
                    case 'f' -> sb.append('\f');
                    case 'n' -> sb.append('\n');
                    case 'r' -> sb.append('\r');
                    case 't' -> sb.append('\t');
                    case 'u' -> {
                        sb.append((char) Integer.parseInt(src.substring(pos, pos + 4), 16));
                        pos += 4;
                    }
                    default -> throw new IllegalArgumentException("Bad escape '\\" + e + "'");
                }
            } else {
                sb.append(c);
            }
        }
    }

    private Object literal() {
        if (src.startsWith("true", pos)) {
            pos += 4;
            return Boolean.TRUE;
        }
        if (src.startsWith("false", pos)) {
            pos += 5;
            return Boolean.FALSE;
        }
        if (src.startsWith("null", pos)) {
            pos += 4;
            return null;
        }
        throw new IllegalArgumentException("Bad literal at offset " + pos);
    }

    private Object number() {
        int start = pos;
        while (pos < src.length() && "-+.eE0123456789".indexOf(src.charAt(pos)) >= 0) {
            pos++;
        }
        String n = src.substring(start, pos);
        if (n.isEmpty()) {
            throw new IllegalArgumentException("Bad JSON value at offset " + start);
        }
        if (n.indexOf('.') < 0 && n.indexOf('e') < 0 && n.indexOf('E') < 0) {
            try {
                return Long.parseLong(n);
            } catch (NumberFormatException ignored) {
                // fall through to double
            }
        }
        return Double.parseDouble(n);
    }

    private void ws() {
        while (pos < src.length() && Character.isWhitespace(src.charAt(pos))) {
            pos++;
        }
    }

    private char peek() {
        return pos < src.length() ? src.charAt(pos) : '\0';
    }

    private char next() {
        if (pos >= src.length()) {
            throw new IllegalArgumentException("Unexpected end of JSON");
        }
        return src.charAt(pos++);
    }

    private void expect(char c) {
        if (next() != c) {
            throw new IllegalArgumentException("Expected '" + c + "' at offset " + (pos - 1));
        }
    }

    // ---- writing ---------------------------------------------------------

    public static String write(Object value) {
        StringBuilder sb = new StringBuilder();
        writeValue(sb, value, 0);
        return sb.toString();
    }

    private static void writeValue(StringBuilder sb, Object v, int indent) {
        switch (v) {
            case null -> sb.append("null");
            case String s -> writeString(sb, s);
            case Boolean b -> sb.append(b);
            case Number n -> {
                if (n instanceof Double d && d == Math.floor(d) && !d.isInfinite()) {
                    sb.append(d.longValue());
                } else {
                    sb.append(n);
                }
            }
            case Map<?, ?> m -> {
                sb.append("{\n");
                int i = 0;
                for (Map.Entry<?, ?> e : m.entrySet()) {
                    pad(sb, indent + 1);
                    writeString(sb, String.valueOf(e.getKey()));
                    sb.append(": ");
                    writeValue(sb, e.getValue(), indent + 1);
                    if (++i < m.size()) {
                        sb.append(',');
                    }
                    sb.append('\n');
                }
                pad(sb, indent);
                sb.append('}');
            }
            case List<?> l -> {
                sb.append("[\n");
                for (int i = 0; i < l.size(); i++) {
                    pad(sb, indent + 1);
                    writeValue(sb, l.get(i), indent + 1);
                    if (i < l.size() - 1) {
                        sb.append(',');
                    }
                    sb.append('\n');
                }
                pad(sb, indent);
                sb.append(']');
            }
            default -> writeString(sb, String.valueOf(v));
        }
    }

    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
    }

    private static void pad(StringBuilder sb, int indent) {
        sb.append("  ".repeat(indent));
    }
}
