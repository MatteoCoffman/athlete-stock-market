import { Linking, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "../constants/theme";
import type { NewsArticle } from "../lib/api";

type Props = {
  article: NewsArticle;
  first?: boolean;
};

function formatPublished(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NewsCard({ article, first }: Props) {
  async function open() {
    try {
      await Linking.openURL(article.url);
    } catch {
      /* ignore */
    }
  }

  return (
    <Pressable onPress={open} style={[styles.card, first && styles.cardFirst]}>
      {article.image ? (
        <Image source={{ uri: article.image }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Text style={styles.thumbLetter}>N</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={3}>
          {article.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[article.source, formatPublished(article.published)].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cardFirst: {
    borderTopWidth: 0,
    paddingTop: 4,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radii.sm,
    backgroundColor: colors.bgElevated,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbLetter: { color: colors.orange, fontWeight: "800", fontSize: 18 },
  body: { flex: 1, justifyContent: "center", gap: 4 },
  title: { color: colors.text, fontWeight: "700", fontSize: 14, lineHeight: 19 },
  meta: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
});
