import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

export async function uploadPlayerPhoto(
  playerId: string,
  file: File
): Promise<string> {
  if (file.size > 1024 * 1024) {
    throw new Error("File size must be 1MB or less");
  }
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    throw new Error("Only JPEG and PNG files are accepted");
  }
  const storageRef = ref(storage, `players/${playerId}/photo.jpg`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function getPlayerPhotoURL(
  playerId: string
): Promise<string | null> {
  try {
    const storageRef = ref(storage, `players/${playerId}/photo.jpg`);
    return await getDownloadURL(storageRef);
  } catch {
    return null;
  }
}
