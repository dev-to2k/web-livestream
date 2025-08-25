/**
 * Generate a random room ID
 */
export const generateRoomId = (length = 6) => {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length)
    .toUpperCase();
};

/**
 * Validate room ID format
 */
export const isValidRoomId = (roomId) => {
  if (!roomId || typeof roomId !== "string") return false;
  return /^[A-Z0-9]{6}$/.test(roomId.trim());
};

/**
 * Validate username
 */
export const isValidUsername = (username) => {
  if (!username || typeof username !== "string") return false;
  const trimmed = username.trim();
  return trimmed.length >= 1 && trimmed.length <= 20;
};

/**
 * Format room URL
 */
export const formatRoomUrl = (roomId) => {
  return `${window.location.origin}/room/${roomId}`;
};

/**
 * Extract room ID from URL
 */
export const extractRoomIdFromUrl = (url) => {
  const match = url.match(/\/room\/([A-Z0-9]{6})/);
  return match ? match[1] : null;
};
