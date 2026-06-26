// ============================================
// PLAYER STORE
// Permanent player roster synced with Firebase
// ============================================

import { create } from "zustand";
import { subscribeToPlayers, savePlayer, updatePlayer, deletePlayer } from "../db/playerDB";

import type { Player, SkillTier, CommunityRating } from "../types";
import type { Unsubscribe } from "firebase/firestore";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

interface PlayerStore {
  roster: Player[];
  loading: boolean;
  error: string | null;
  _unsubscribe: Unsubscribe | null;

  // Subscribe to real-time roster updates
  loadRoster: () => void;
  // Unsubscribe from real-time listener (call on unmount)
  unsubscribeRoster: () => void;

  // Add new player to roster
  addToRoster: (
    name: string,
    tier: SkillTier,
    division: number
  ) => Promise<void>;

  // Update player in roster
  updateRosterPlayer: (
    playerId: string,
    updates: Partial<Player>
  ) => Promise<void>;

  // Remove player from roster
  removeFromRoster: (playerId: string) => Promise<void>;

  // Update self rating
  updateRating: (
    playerId: string,
    type: "self",
    tier: SkillTier,
    division: number
  ) => Promise<void>;

  // Add anonymous community rating (max 5)
  addCommunityRating: (
    playerId: string,
    tier: SkillTier,
    division: number
  ) => Promise<void>;

  // Update player photo URL
  updatePlayerPhoto: (playerId: string, photoURL: string) => Promise<void>;

  // Admin: clear all community ratings for a player
  resetCommunityRatings: (playerId: string) => Promise<void>;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  roster: [],
  loading: false,
  error: null,
  _unsubscribe: null,

  loadRoster: () => {
    // Cancel any existing subscription first
    get()._unsubscribe?.();
    set({ loading: true, error: null });
    const unsub = subscribeToPlayers(async (players) => {
      // Auto-deduplicate: two players are duplicates only when BOTH
      // name AND self-rating (tier + division) match — same name at
      // different skill levels = different people, keep both.
      const byFingerprint = new Map<string, Player[]>();
      for (const p of players) {
        const key = [
          p.name.trim().toLowerCase(),
          p.ratings.self.tier,
          p.ratings.self.division.toFixed(1),
        ].join("|");
        byFingerprint.set(key, [...(byFingerprint.get(key) ?? []), p]);
      }
      const toDelete: string[] = [];
      for (const group of byFingerprint.values()) {
        if (group.length < 2) continue;
        // Keep the richest copy: photo > most community ratings > earliest joined
        const scored = group.map((p) => ({
          p,
          score:
            (p.photoURL ? 10 : 0) +
            (p.ratings.community?.length ?? 0) -
            (p.joinedAt ?? 0) / 1e12,
        }));
        scored.sort((a, b) => b.score - a.score);
        for (let i = 1; i < scored.length; i++) toDelete.push(scored[i].p.id);
      }
      if (toDelete.length > 0) {
        await Promise.all(toDelete.map((id) => deletePlayer(id)));
        // onSnapshot will fire again with the cleaned list — no need to set here
        return;
      }
      set({ roster: players, loading: false });
    });
    set({ _unsubscribe: unsub });
  },

  unsubscribeRoster: () => {
    get()._unsubscribe?.();
    set({ _unsubscribe: null });
  },

  addToRoster: async (name, tier, division) => {
    // Don't create a duplicate if same name AND same rating already exists
    const existing = get().roster.find(
      (p) =>
        p.name.trim().toLowerCase() === name.trim().toLowerCase() &&
        p.ratings.self.tier === tier &&
        p.ratings.self.division === division
    );
    if (existing) return;

    const newPlayer: Player = {
      id: generateId("player"),
      name,
      ratings: {
        self: { tier, division },
        community: [],
        system: null,
      },
      attendanceStatus: "PRESENT",
      payment: { status: "UNPAID" },
      leavingSoon: null,
      notes: "",
      gamesPlayed: 0,
      gamesWon: 0,
      waitingSince: null,
      consecutiveGames: 0,
      partners: [],
      opponents: [],
      joinedAt: Date.now(),
    };

    try {
      await savePlayer(newPlayer);
      // onSnapshot listener will update roster automatically — don't push manually
    } catch (error) {
      set({ error: "Failed to add player" });
    }
  },

  updateRosterPlayer: async (playerId, updates) => {
    try {
      await updatePlayer(playerId, updates);
      set((state) => ({
        roster: state.roster.map((p) =>
          p.id === playerId ? { ...p, ...updates } : p
        ),
      }));
    } catch (error) {
      set({ error: "Failed to update player" });
    }
  },

  removeFromRoster: async (playerId) => {
    try {
      await deletePlayer(playerId);
      // onSnapshot will remove from roster automatically
    } catch (error) {
      set({ error: "Failed to remove player" });
    }
  },

  updateRating: async (playerId, type, tier, division) => {
    const { roster } = get();
    const player = roster.find((p) => p.id === playerId);
    if (!player) return;

    const updatedRatings = {
      ...player.ratings,
      [type]: { tier, division },
    };

    await get().updateRosterPlayer(playerId, { ratings: updatedRatings });
  },

  addCommunityRating: async (playerId, tier, division) => {
    const { roster } = get();
    const player = roster.find((p) => p.id === playerId);
    if (!player) return;
    const existingCommunity = player.ratings.community ?? [];
    if (existingCommunity.length >= 10) return;

    const newRating: CommunityRating = {
      id: `cr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      rating: { tier, division },
      createdAt: Date.now(),
    };

    const updatedRatings = {
      ...player.ratings,
      community: [...existingCommunity, newRating],
    };

    await get().updateRosterPlayer(playerId, { ratings: updatedRatings });
  },

  updatePlayerPhoto: async (playerId, photoURL) => {
    await get().updateRosterPlayer(playerId, { photoURL });
  },

  resetCommunityRatings: async (playerId) => {
    const { roster } = get();
    const player = roster.find((p) => p.id === playerId);
    if (!player) return;
    await get().updateRosterPlayer(playerId, {
      ratings: { ...player.ratings, community: [] },
    });
  },
}));