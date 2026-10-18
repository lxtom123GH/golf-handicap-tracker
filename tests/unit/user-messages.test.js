// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { InputMessage, userErrorMessage } from '../../src/user-messages.js';

describe('safe user-facing errors', () => {
    it.each([null, undefined, 'SENSITIVE_DIAGNOSTIC', new Error('SENSITIVE_DIAGNOSTIC'),
        { code: 'unknown', message: 'SENSITIVE_DIAGNOSTIC' },
        { name: 'InputMessage', message: 'SENSITIVE_DIAGNOSTIC' }])('uses caller copy for an untrusted value (%j)', error => {
        expect(userErrorMessage(error, 'Try again.')).toBe('Try again.');
    });
    it.each(['unauthenticated','functions/unauthenticated','storage/unauthenticated',
        'permission-denied','functions/permission-denied','storage/unauthorized',
        'unavailable','functions/unavailable','auth/network-request-failed','storage/retry-limit-exceeded'])
    ('maps %s without revealing service diagnostics', code => {
        const result = userErrorMessage({code, message:'SENSITIVE_DIAGNOSTIC'}, 'Try again.');
        expect(result).not.toContain('SENSITIVE_DIAGNOSTIC');
        expect(result).toMatch(/Sign in|administrator|connection/);
    });
    it('preserves a locally constructed input correction', () => {
        expect(userErrorMessage(new InputMessage('Choose a video smaller than 100 MB.'), 'Try again.'))
            .toBe('Choose a video smaller than 100 MB.');
    });
    it('keeps direct error-message sinks out of application renderers', () => {
        function files(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(e =>
            e.isDirectory() ? files(join(dir,e.name)) : e.name.endsWith('.js') ? [join(dir,e.name)] : []); }
        const bad=[];
        for (const path of files('src')) {
            const lines=readFileSync(path,'utf8').split('\n');
            lines.forEach((line,i) => {
                if (/(?:textContent\s*=|innerHTML\s*=|\balert\(|\bsay\().*(?:\b(?:err|error|e)\??\.message|String\((?:err|error|e)\))/.test(line)) bad.push(`${path}:${i+1}`);
            });
        }
        expect(bad).toEqual([]);
    });
});
