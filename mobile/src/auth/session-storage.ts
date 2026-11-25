import * as SecureStore from 'expo-secure-store';

type Slot = 'a' | 'b';
const maxChunks = 256;
const chunkSize = 400;
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const activeKey = (key: string) => `${key}.slot`;
const countKey = (key: string, slot: Slot) => `${key}.${slot}.count`;
const partKey = (key: string, slot: Slot, index: number) => `${key}.${slot}.${index}`;

let tail = Promise.resolve();

function serialize<T>(operation: () => Promise<T>) {
  const result = tail.then(operation);
  tail = result.then(() => undefined, () => undefined);
  return result;
}

async function activeSlot(key: string): Promise<Slot | null> {
  const slot = await SecureStore.getItemAsync(activeKey(key), options);
  return slot === 'a' || slot === 'b' ? slot : null;
}

async function storedCount(key: string, slot: Slot) {
  const value = await SecureStore.getItemAsync(countKey(key, slot), options);
  if (value === null || !/^\d{1,3}$/.test(value)) return null;
  const count = Number(value);
  return count <= maxChunks ? count : null;
}

async function clearSlot(key: string, slot: Slot) {
  const count = await storedCount(key, slot);
  if (count === null) return;
  await Promise.all(Array.from({ length: count }, (_, index) =>
    SecureStore.deleteItemAsync(partKey(key, slot, index), options)));
  await SecureStore.deleteItemAsync(countKey(key, slot), options);
}

export const sessionStorage = {
  getItem: (key: string) => serialize(async () => {
    const slot = await activeSlot(key);
    if (slot === null) return null;
    const count = await storedCount(key, slot);
    if (count === null) return null;
    const chunks = await Promise.all(Array.from({ length: count }, (_, index) =>
      SecureStore.getItemAsync(partKey(key, slot, index), options)));
    return chunks.some((chunk) => chunk === null) ? null : chunks.join('');
  }),

  setItem: (key: string, value: string) => serialize(async () => {
    // Split by code point so every SecureStore entry is below the historical 2 KB limit.
    const points = Array.from(value);
    const count = Math.ceil(points.length / chunkSize);
    if (count > maxChunks) throw new Error('The account session exceeds the secure storage limit.');

    const previous = await activeSlot(key);
    const slot = previous === 'a' ? 'b' : 'a';
    const reserved = Math.max(count, (await storedCount(key, slot)) ?? 0);

    // Commit the new slot only after all parts are written. A failed write leaves the old slot readable.
    await SecureStore.setItemAsync(countKey(key, slot), String(reserved), options);
    for (let index = 0; index < count; index += 1) {
      const part = points.slice(index * chunkSize, (index + 1) * chunkSize).join('');
      await SecureStore.setItemAsync(partKey(key, slot, index), part, options);
    }
    for (let index = count; index < reserved; index += 1) {
      await SecureStore.deleteItemAsync(partKey(key, slot, index), options);
    }
    await SecureStore.setItemAsync(countKey(key, slot), String(count), options);
    await SecureStore.setItemAsync(activeKey(key), slot, options);
    if (previous) await Promise.allSettled([clearSlot(key, previous)]);
  }),

  removeItem: (key: string) => serialize(async () => {
    await SecureStore.deleteItemAsync(activeKey(key), options);
    await Promise.allSettled([clearSlot(key, 'a'), clearSlot(key, 'b')]);
  }),
};
