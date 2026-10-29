package it.akhbar.post;

import java.util.*;
import java.util.regex.*;

/** Returns spans without rewriting, uppercasing or truncating the original title. */
public final class CoverTextRules {
    private CoverTextRules() {}
    public static List<int[]> highlights(String title, String keywords) {
        List<int[]> ranges = new ArrayList<>();
        for (String value : keywords.split("[,;\\n،]+")) {
            String key = value.trim(); if (key.isEmpty()) continue;
            Pattern pattern = Pattern.compile("(?<![\\p{L}\\p{N}_])" + Pattern.quote(key) + "(?![\\p{L}\\p{N}_])",
                    Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
            Matcher matcher = pattern.matcher(title);
            while (matcher.find()) ranges.add(new int[]{matcher.start(), matcher.end()});
        }
        return ranges;
    }
}
