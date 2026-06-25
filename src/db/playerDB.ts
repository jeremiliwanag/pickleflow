// ============================================
// PLAYER DATABASE
// Permanent player roster stored in Firebase
// ============================================

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Player } from "../types";

const PLAYERS_COLLECTION = "players";

// ============================================
// GET ALL PLAYERS
// Returns the full permanent roster
// ============================================

export async function getAllPlayers(): Promise<Player[]> {
  try {
    const q = query(
      collection(db, PLAYERS_COLLECTION),
      orderBy("name")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as Player);
  } catch (error) {
    console.error("Error getting players:", error);
    return [];
  }
}

// ============================================
// SAVE PLAYER
// Creates or updates a player in the roster
// ============================================

export async function savePlayer(player: Player): Promise<void> {
  try {
    await setDoc(
      doc(db, PLAYERS_COLLECTION, player.id),
      player
    );
  } catch (error) {
    console.error("Error saving player:", error);
  }
}

// ============================================
// UPDATE PLAYER
// Partial update -- only changes specified fields
// ============================================

export async function updatePlayer(
  playerId: string,
  updates: Partial<Player>
): Promise<void> {
  try {
    await updateDoc(
      doc(db, PLAYERS_COLLECTION, playerId),
      updates as Record<string, unknown>
    );
  } catch (error) {
    console.error("Error updating player:", error);
  }
}

// ============================================
// DELETE PLAYER
// Removes player from permanent roster
// ============================================

export async function deletePlayer(playerId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, PLAYERS_COLLECTION, playerId));
  } catch (error) {
    console.error("Error deleting player:", error);
  }
}