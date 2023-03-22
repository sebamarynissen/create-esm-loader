// # run.js
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Note: mocha will try to run this file, but it obviously shouldn't. Hence, if 
// we're not running as a forked process, we do nothing.
if (process.send) {
	const [,, base64] = process.argv;
	const code = Buffer.from(base64, 'base64');
	const url = new URL('./code.js', import.meta.url);
	const file = fileURLToPath(url);
	try {
		await fs.writeFile(file, code);
		const module = await import(url);
		process.send(module.default || null);
	} finally {
		fs.unlink(file);
	}
}
