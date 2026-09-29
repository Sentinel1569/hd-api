const items = new Map();

export async function getItemAsync(key) {
  return items.get(key) ?? null;
}
export async function setItemAsync(key, value) {
  items.set(key, value);
}
export async function deleteItemAsync(key) {
  items.delete(key);
}
