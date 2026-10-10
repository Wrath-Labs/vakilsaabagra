#!/usr/bin/env node
/**
 * Sets the admin password for /admin/stats.html.
 *
 *   node tools/set-admin-password.js
 *
 * Asks for the password twice, with the keystrokes hidden, and prints ONE SQL
 * statement. Paste that into the D1 console (Cloudflare dashboard -> Workers &
 * Pages -> D1 -> vakilsaabagra -> Console). Running it again replaces the
 * password and signs everyone out, because the sessions table is cleared by the
 * second statement.
 *
 * The password itself is never written anywhere, and what is printed is a salted
 * hash, not something that can be reversed into the password. It must be run in
 * a real terminal: it needs one to hide the typing.
 *
 * The iteration count has to match functions/_auth.js (Cloudflare Workers caps
 * PBKDF2 at 100,000).
 */
'use strict';

const crypto = require('node:crypto');
const readline = require('node:readline');

const ITERATIONS = 100000;
const MIN_LENGTH = 12;

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      /* echo the prompt, never the typing */
      if (s.includes(prompt)) rl.output.write(prompt);
      else if (s === '\r\n' || s === '\n') rl.output.write('\n');
    };
    rl.question(prompt, (answer) => { rl.close(); resolve(answer); });
  });
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error('This needs an interactive terminal (it hides what you type).\n' +
                  'Run it in Terminal, not through a pipe or the "!" prompt.');
    process.exit(1);
  }

  const a = await ask('New admin password: ');
  if (a.length < MIN_LENGTH) {
    console.error(`Use at least ${MIN_LENGTH} characters. A few random words is plenty.`);
    process.exit(1);
  }
  const b = await ask('Again: ');
  if (a !== b) { console.error('They do not match. Nothing was changed.'); process.exit(1); }

  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(a, salt, ITERATIONS, 32, 'sha256');

  console.log('\nPaste this into the D1 console and run it:\n');
  console.log(
    `INSERT OR REPLACE INTO admin_auth (id, salt, hash, iterations, updated) VALUES ` +
    `(1, '${salt.toString('hex')}', '${hash.toString('hex')}', ${ITERATIONS}, ${Date.now()});`
  );
  console.log('DELETE FROM admin_sessions;');
  console.log('\nThen sign in at https://vakilsaabagra.in/admin/stats.html with the password you just typed.');
}

main();
