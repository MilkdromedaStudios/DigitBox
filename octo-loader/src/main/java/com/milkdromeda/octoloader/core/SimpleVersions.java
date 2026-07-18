package com.milkdromeda.octoloader.core;

/**
 * Best-effort version constraint matching for the constraints found in mod metadata
 * ("*", "26.2", "26.x", ">=26.1", "~1.21.4", ">=26.1 <27", "1.20.1 || 26.2", ...).
 * This is intentionally forgiving: when Octo Loader cannot prove a constraint is
 * satisfied it falls back to asking Modrinth for the right build anyway.
 */
public final class SimpleVersions {

    private SimpleVersions() {
    }

    public static boolean matches(String constraint, String gameVersion) {
        if (constraint == null || constraint.isBlank() || constraint.equals("*")) {
            return true;
        }
        for (String orPart : constraint.split("\\|\\|")) {
            boolean all = true;
            for (String andPart : orPart.trim().split("\\s+")) {
                if (!single(andPart.trim(), gameVersion)) {
                    all = false;
                    break;
                }
            }
            if (all && !orPart.isBlank()) {
                return true;
            }
        }
        return false;
    }

    private static boolean single(String c, String v) {
        if (c.isEmpty() || c.equals("*")) {
            return true;
        }
        if (c.startsWith(">=")) {
            return compare(v, c.substring(2)) >= 0;
        }
        if (c.startsWith("<=")) {
            return compare(v, c.substring(2)) <= 0;
        }
        if (c.startsWith(">")) {
            return compare(v, c.substring(1)) > 0;
        }
        if (c.startsWith("<")) {
            return compare(v, c.substring(1)) < 0;
        }
        if (c.startsWith("=")) {
            return compare(v, c.substring(1)) == 0;
        }
        if (c.startsWith("~") || c.startsWith("^")) {
            // ~26.2 / ^26.2: same major line, at least the given version.
            String base = c.substring(1);
            return compare(v, base) >= 0 && sameMajor(v, base);
        }
        if (c.endsWith(".x") || c.endsWith(".X") || c.endsWith(".*")) {
            String prefix = c.substring(0, c.length() - 1); // keep the trailing dot
            return v.startsWith(prefix) || compare(v, c.substring(0, c.length() - 2)) == 0;
        }
        return compare(v, c) == 0;
    }

    private static boolean sameMajor(String a, String b) {
        return firstPart(a).equals(firstPart(b));
    }

    private static String firstPart(String v) {
        int i = v.indexOf('.');
        return i < 0 ? v : v.substring(0, i);
    }

    /** Compares dotted version strings numerically part by part; non-numeric parts compare as text. */
    public static int compare(String a, String b) {
        String[] pa = a.split("[.\\-+]");
        String[] pb = b.split("[.\\-+]");
        int len = Math.max(pa.length, pb.length);
        for (int i = 0; i < len; i++) {
            String xa = i < pa.length ? pa[i] : "0";
            String xb = i < pb.length ? pb[i] : "0";
            Integer na = asInt(xa);
            Integer nb = asInt(xb);
            int cmp;
            if (na != null && nb != null) {
                cmp = Integer.compare(na, nb);
            } else {
                cmp = xa.compareTo(xb);
            }
            if (cmp != 0) {
                return cmp;
            }
        }
        return 0;
    }

    private static Integer asInt(String s) {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
