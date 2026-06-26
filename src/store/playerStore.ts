// ============================================
// PLAYER STORE
// Permanent player roster synced with Firebase
// ============================================

import { create } from "zustand";
import { getAllPlayers, savePlayer, updatePlayer, deletePlayer } from "../db/playerDB";
import type { Player, SkillTier, CommunityRating } from "../types";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

interface PlayerStore {
  roster: Player[];
  loading: boolean;
  error: string | null;

  // Load all players from Firebase
  loadRoster: () => Promise<void>;

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
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  roster: [],
  loading: false,
  error: null,

  loadRoster: async () => {
    set({ loading: true, error: null });
    try {
      const players = await getAllPlayers();
      set({ roster: players, loading: false });
    } catch (error) {
      set({ error: "Failed to load players", loading: false });
    }
  },

  addToRoster: async (name, tier, division) => {
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
      set((state) => ({ roster: [...state.roster, newPlayer] }));
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
      set((state) => ({
        roster: state.roster.filter((p) => p.id !== playerId),
      }));
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
    if (existingCommunity.length >= 5) return;

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

}));