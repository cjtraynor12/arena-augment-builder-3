// IndexedDB and localStorage utilities

// ===== INDEXEDDB =====
const dbPromise = indexedDB.open('AugmentImageStore', 1);

dbPromise.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images', { keyPath: 'id' });
    }
};

function getDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('AugmentImageStore', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveImageToDb(id, blob) {
    const db = await getDb();
    const transaction = db.transaction(['images'], 'readwrite');
    const store = transaction.objectStore('images');
    await store.put({ id, blob });
}

export async function getImageFromDb(id) {
    const db = await getDb();
    const transaction = db.transaction(['images'], 'readonly');
    const store = transaction.objectStore('images');
    const result = await new Promise((resolve) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
    return result ? result.blob : null;
}

export async function deleteImageFromDb(id) {
    const db = await getDb();
    const transaction = db.transaction(['images'], 'readwrite');
    const store = transaction.objectStore('images');
    await store.delete(id);
}

export function base64ToBlob(base64, contentType = 'image/png') {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
}

export function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ===== LOCAL STORAGE =====
export function saveToLocalStorage(key, value) {
    try {
        localStorage.setItem(`augmentBuilder_${key}`, JSON.stringify(value));
        return true;
    } catch (e) {
        console.error('Failed to save to localStorage:', e);
        return false;
    }
}

export function loadFromLocalStorage(key, defaultValue) {
    try {
        const stored = localStorage.getItem(`augmentBuilder_${key}`);
        return stored ? JSON.parse(stored) : defaultValue;
    } catch (e) {
        console.error('Failed to load from localStorage:', e);
        return defaultValue;
    }
}
