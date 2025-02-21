import { atom } from 'jotai'

// Store a map of ayah IDs to their version numbers
export const splitAyahsAtom = atom<Record<string, number>>({}) 