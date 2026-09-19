// CP-5 — the built-in exercise library is a static JSON the client fetches;
// functions/ deploys standalone and cannot read ../data, so list_exercises
// requires a mirrored copy. This test is the only thing keeping the two in
// sync: edit data/exercises.json, copy it to functions/data/, or this fails.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('functions/data/exercises.json mirrors data/exercises.json', () => {
    it('is byte-for-byte identical', () => {
        const client = readFileSync('data/exercises.json', 'utf8');
        const server = readFileSync('functions/data/exercises.json', 'utf8');
        expect(server).toBe(client);
    });
});
