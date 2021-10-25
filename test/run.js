// # run.js
import fs from 'node:fs/promises';

// Note: mocha will try to run this file, but it obviously shouldn't. Hence, if 
// we're not running as a forked process, we do nothing.
if (process.send) {
	const [,, base64] = process.argv;
	const code = Buffer.from(base64, 'base64');
	const file = './code.js';
	try {
		await fs.writeFile(file, code);
		const module = await import(file);
		process.send(module.default);
	} finally {
		fs.unlink(file);
	}
}
