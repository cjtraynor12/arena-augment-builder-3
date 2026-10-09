// XXH3-64 (seed 0) for inputs up to 240 bytes — enough for stringtable keys.
//
// CommunityDragon's lol.stringtable.json prints `{hash}` instead of the key
// for strings whose names aren't in its hash list yet (common on PBE right
// after new content ships). The hash is XXH3-64 of the lowercased key,
// truncated to the RST file's bit width (see CDTB rstfile.py key_to_hash).
// Port of the short-input paths of the reference implementation (xxhash.h).

const MASK64 = (1n << 64n) - 1n;

const PRIME64_1 = 0x9E3779B185EBCA87n;
const PRIME64_2 = 0xC2B2AE3D27D4EB4Fn;
const PRIME64_3 = 0x165667B19E3779F9n;
const PRIME_MX1 = 0x165667919E3779F9n;
const PRIME_MX2 = 0x9FB21C651E98DF25n;

// Default 192-byte secret (XXH3_kSecret).
const SECRET = Uint8Array.from([
    0xb8, 0xfe, 0x6c, 0x39, 0x23, 0xa4, 0x4b, 0xbe, 0x7c, 0x01, 0x81, 0x2c, 0xf7, 0x21, 0xad, 0x1c,
    0xde, 0xd4, 0x6d, 0xe9, 0x83, 0x90, 0x97, 0xdb, 0x72, 0x40, 0xa4, 0xa4, 0xb7, 0xb3, 0x67, 0x1f,
    0xcb, 0x79, 0xe6, 0x4e, 0xcc, 0xc0, 0xe5, 0x78, 0x82, 0x5a, 0xd0, 0x7d, 0xcc, 0xff, 0x72, 0x21,
    0xb8, 0x08, 0x46, 0x74, 0xf7, 0x43, 0x24, 0x8e, 0xe0, 0x35, 0x90, 0xe6, 0x81, 0x3a, 0x26, 0x4c,
    0x3c, 0x28, 0x52, 0xbb, 0x91, 0xc3, 0x00, 0xcb, 0x88, 0xd0, 0x65, 0x8b, 0x1b, 0x53, 0x2e, 0xa3,
    0x71, 0x64, 0x48, 0x97, 0xa2, 0x0d, 0xf9, 0x4e, 0x38, 0x19, 0xef, 0x46, 0xa9, 0xde, 0xac, 0xd8,
    0xa8, 0xfa, 0x76, 0x3f, 0xe3, 0x9c, 0x34, 0x3f, 0xf9, 0xdc, 0xbb, 0xc7, 0xc7, 0x0b, 0x4f, 0x1d,
    0x8a, 0x51, 0xe0, 0x4b, 0xcd, 0xb4, 0x59, 0x31, 0xc8, 0x9f, 0x7e, 0xc9, 0xd9, 0x78, 0x73, 0x64,
    0xea, 0xc5, 0xac, 0x83, 0x34, 0xd3, 0xeb, 0xc3, 0xc5, 0x81, 0xa0, 0xff, 0xfa, 0x13, 0x63, 0xeb,
    0x17, 0x0d, 0xdd, 0x51, 0xb7, 0xf0, 0xda, 0x49, 0xd3, 0x16, 0x55, 0x26, 0x29, 0xd4, 0x68, 0x9e,
    0x2b, 0x16, 0xbe, 0x58, 0x7d, 0x47, 0xa1, 0xfc, 0x8f, 0xf8, 0xb8, 0xd1, 0x7a, 0xd0, 0x31, 0xce,
    0x45, 0xcb, 0x3a, 0x8f, 0x95, 0x16, 0x04, 0x28, 0xaf, 0xd7, 0xfb, 0xca, 0xbb, 0x4b, 0x40, 0x7e
]);

function read32(bytes, offset) {
    return BigInt((bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0);
}

function read64(bytes, offset) {
    return read32(bytes, offset) | (read32(bytes, offset + 4) << 32n);
}

const mul64 = (a, b) => (a * b) & MASK64;
const rotl64 = (x, r) => ((x << BigInt(r)) | (x >> BigInt(64 - r))) & MASK64;

function swap64(x) {
    let result = 0n;
    for (let i = 0; i < 8; i++) {
        result = (result << 8n) | ((x >> BigInt(8 * i)) & 0xffn);
    }
    return result;
}

function mul128Fold64(a, b) {
    const product = a * b;
    return (product & MASK64) ^ (product >> 64n);
}

function xxh64Avalanche(h) {
    h ^= h >> 33n;
    h = mul64(h, PRIME64_2);
    h ^= h >> 29n;
    h = mul64(h, PRIME64_3);
    return h ^ (h >> 32n);
}

function xxh3Avalanche(h) {
    h ^= h >> 37n;
    h = mul64(h, PRIME_MX1);
    return h ^ (h >> 32n);
}

function rrmxmx(h, length) {
    h ^= rotl64(h, 49) ^ rotl64(h, 24);
    h = mul64(h, PRIME_MX2);
    h ^= (h >> 35n) + BigInt(length);
    h = mul64(h, PRIME_MX2);
    return h ^ (h >> 28n);
}

function mix16(bytes, offset, secretOffset) {
    return mul128Fold64(
        read64(bytes, offset) ^ read64(SECRET, secretOffset),
        read64(bytes, offset + 8) ^ read64(SECRET, secretOffset + 8)
    );
}

// Returns the 64-bit hash as a BigInt, or null for inputs over 240 bytes.
export function xxh3_64(input) {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    const len = bytes.length;

    if (len === 0) {
        return xxh64Avalanche(read64(SECRET, 56) ^ read64(SECRET, 64));
    }
    if (len <= 3) {
        const combined = (BigInt(bytes[0]) << 16n) | (BigInt(bytes[len >> 1]) << 24n)
            | BigInt(bytes[len - 1]) | (BigInt(len) << 8n);
        const bitflip = read32(SECRET, 0) ^ read32(SECRET, 4);
        return xxh64Avalanche(combined ^ bitflip);
    }
    if (len <= 8) {
        const input64 = read32(bytes, len - 4) + (read32(bytes, 0) << 32n);
        const bitflip = read64(SECRET, 8) ^ read64(SECRET, 16);
        return rrmxmx(input64 ^ bitflip, len);
    }
    if (len <= 16) {
        const inputLo = read64(bytes, 0) ^ (read64(SECRET, 24) ^ read64(SECRET, 32));
        const inputHi = read64(bytes, len - 8) ^ (read64(SECRET, 40) ^ read64(SECRET, 48));
        const acc = (BigInt(len) + swap64(inputLo) + inputHi + mul128Fold64(inputLo, inputHi)) & MASK64;
        return xxh3Avalanche(acc);
    }
    if (len <= 128) {
        let acc = mul64(BigInt(len), PRIME64_1);
        if (len > 32) {
            if (len > 64) {
                if (len > 96) {
                    acc += mix16(bytes, 48, 96);
                    acc += mix16(bytes, len - 64, 112);
                }
                acc += mix16(bytes, 32, 64);
                acc += mix16(bytes, len - 48, 80);
            }
            acc += mix16(bytes, 16, 32);
            acc += mix16(bytes, len - 32, 48);
        }
        acc += mix16(bytes, 0, 0);
        acc += mix16(bytes, len - 16, 16);
        return xxh3Avalanche(acc & MASK64);
    }
    if (len <= 240) {
        let acc = mul64(BigInt(len), PRIME64_1);
        const rounds = Math.floor(len / 16);
        for (let i = 0; i < 8; i++) acc += mix16(bytes, 16 * i, 16 * i);
        acc = xxh3Avalanche(acc & MASK64);
        for (let i = 8; i < rounds; i++) acc += mix16(bytes, 16 * i, 16 * (i - 8) + 3);
        acc += mix16(bytes, len - 16, 136 - 17);
        return xxh3Avalanche(acc & MASK64);
    }
    return null;
}
