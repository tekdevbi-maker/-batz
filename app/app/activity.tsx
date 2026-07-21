import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useRequireAuth } from "../lib/AuthContext";
import { supabase } from "../lib/supabase";
import {
  describeMilestone,
  likePost,
  listFollowingFeed,
  unlikePost,
  type ActivityFeedPost,
} from "../lib/socialRepository";
import BlockReportButtons from "../components/BlockReportButtons";
import { colors } from "../lib/theme";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export default function ActivityFeedScreen() {
  const { session } = useRequireAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<ActivityFeedPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    listFollowingFeed(supabase, session.user.id)
      .then((p) => {
        setPosts(p);
        setLoaded(true);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setLoaded(true);
      });
  }, [session]);

  useFocusEffect(load);

  async function toggleLike(post: ActivityFeedPost) {
    if (!session) return;
    try {
      if (post.likedByMe) {
        await unlikePost(supabase, post.id, session.user.id);
      } else {
        await likePost(supabase, post.id, session.user.id);
      }
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
            : p
        )
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!session) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Activity Feed</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {loaded && posts.length === 0 && (
        <Text style={styles.hint}>No milestones yet. Follow some players to see their achievements here.</Text>
      )}
      {posts.map((post) => (
        <View key={post.id} style={styles.postRow}>
          <Pressable onPress={() => router.push(`/player/${post.playerId}`)}>
            <Text style={styles.playerName}>{post.playerDisplayName}</Text>
          </Pressable>
          <Text style={styles.postText}>
            reached {describeMilestone(post)} -- {post.teamName}, {post.gameDate}
          </Text>
          <Pressable onPress={() => toggleLike(post)}>
            <Text style={post.likedByMe ? styles.likedLink : styles.link}>
              {post.likedByMe ? "♥" : "♡"} {post.likeCount}
            </Text>
          </Pressable>
          {post.playerParentUserId && (
            <BlockReportButtons
              myUserId={session.user.id}
              targetUserId={post.playerParentUserId}
              activityFeedItemId={post.id}
            />
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 4, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8, color: colors.textPrimary },
  hint: { color: colors.textSecondary, fontSize: 13 },
  error: { color: colors.error, fontSize: 13 },
  postRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 4,
  },
  playerName: { fontWeight: "600", fontSize: 14, color: colors.textPrimary },
  postText: { fontSize: 13, color: colors.textSecondary },
  link: { color: colors.accent, fontSize: 13 },
  likedLink: { color: colors.danger, fontSize: 13 },
});
