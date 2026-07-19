import type { SupabaseClient } from "@supabase/supabase-js";

export async function isFollowing(supabase: SupabaseClient, playerId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("follow")
    .select("id")
    .eq("player_id", playerId)
    .eq("follower_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function getFollowerCount(supabase: SupabaseClient, playerId: string): Promise<number> {
  const { count, error } = await supabase
    .from("follow")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId);
  if (error) throw error;
  return count ?? 0;
}

export async function followPlayer(supabase: SupabaseClient, playerId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("follow").insert({ player_id: playerId, follower_user_id: userId });
  if (error) throw error;
}

export async function unfollowPlayer(supabase: SupabaseClient, playerId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("follow").delete().eq("player_id", playerId).eq("follower_user_id", userId);
  if (error) throw error;
}

export interface ActivityFeedPost {
  id: string;
  playerId: string;
  playerDisplayName: string;
  playerParentUserId: string;
  teamName: string;
  category: "hits" | "doubles" | "triples" | "home_runs";
  tier: number;
  gameDate: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
}

const CATEGORY_LABELS: Record<ActivityFeedPost["category"], string> = {
  hits: "Hits",
  doubles: "Doubles",
  triples: "Triples",
  home_runs: "Home Runs",
};

export function describeMilestone(post: Pick<ActivityFeedPost, "category" | "tier">): string {
  return `${"⭐".repeat(post.tier)} in ${CATEGORY_LABELS[post.category]}`;
}

async function toPosts(supabase: SupabaseClient, userId: string, rows: any[]): Promise<ActivityFeedPost[]> {
  if (rows.length === 0) return [];
  const itemIds = rows.map((r) => r.id);
  const { data: likeRows, error: likeError } = await supabase
    .from("activity_feed_like")
    .select("activity_feed_item_id, user_id")
    .in("activity_feed_item_id", itemIds);
  if (likeError) throw likeError;

  const likeCounts = new Map<string, number>();
  const likedByMe = new Set<string>();
  for (const like of likeRows ?? []) {
    likeCounts.set(like.activity_feed_item_id, (likeCounts.get(like.activity_feed_item_id) ?? 0) + 1);
    if (like.user_id === userId) likedByMe.add(like.activity_feed_item_id);
  }

  return rows.map((r) => ({
    id: r.id,
    playerId: r.player_id,
    playerDisplayName: r.player?.player_tag ?? "Unknown Player",
    playerParentUserId: r.player?.parent_user_id ?? "",
    teamName: r.team?.name ?? "",
    category: r.category,
    tier: r.tier,
    gameDate: r.game?.game_date ?? "",
    createdAt: r.created_at,
    likeCount: likeCounts.get(r.id) ?? 0,
    likedByMe: likedByMe.has(r.id),
  }));
}

// Following feed (spec Section 8: "Surfaces recent milestones ... to a
// player's followers"). PlayerTag is used directly rather than the
// reveal_full_name-aware display helper -- deliberately simple for v1;
// a follower who's revealed a name relationship would see the tag here.
export async function listFollowingFeed(supabase: SupabaseClient, userId: string, limit = 50): Promise<ActivityFeedPost[]> {
  const { data: follows, error: followError } = await supabase.from("follow").select("player_id").eq("follower_user_id", userId);
  if (followError) throw followError;
  const playerIds = (follows ?? []).map((f: any) => f.player_id);
  if (playerIds.length === 0) return [];

  const { data, error } = await supabase
    .from("activity_feed_item")
    .select("id, player_id, category, tier, created_at, player:player_id(player_tag, parent_user_id), team:team_id(name), game:game_id(game_date)")
    .in("player_id", playerIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return toPosts(supabase, userId, data ?? []);
}

// Recent milestones for a single player -- shown on their own profile.
export async function listPlayerActivity(
  supabase: SupabaseClient,
  playerId: string,
  userId: string,
  limit = 5
): Promise<ActivityFeedPost[]> {
  const { data, error } = await supabase
    .from("activity_feed_item")
    .select("id, player_id, category, tier, created_at, player:player_id(player_tag, parent_user_id), team:team_id(name), game:game_id(game_date)")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return toPosts(supabase, userId, data ?? []);
}

export async function likePost(supabase: SupabaseClient, activityFeedItemId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("activity_feed_like").insert({ activity_feed_item_id: activityFeedItemId, user_id: userId });
  if (error) throw error;
}

export async function unlikePost(supabase: SupabaseClient, activityFeedItemId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("activity_feed_like")
    .delete()
    .eq("activity_feed_item_id", activityFeedItemId)
    .eq("user_id", userId);
  if (error) throw error;
}

export interface ReportOrBlockInput {
  reporterUserId: string;
  targetUserId: string;
  actionType: "block" | "report";
  reason?: string;
}

export async function submitBlockOrReport(supabase: SupabaseClient, input: ReportOrBlockInput): Promise<void> {
  const { error } = await supabase.from("block_or_report").insert({
    reporter_user_id: input.reporterUserId,
    target_user_id: input.targetUserId,
    action_type: input.actionType,
    reason: input.reason ?? null,
  });
  if (error) throw error;
}
