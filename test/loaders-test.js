// # test.js
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import cp from 'node:child_process';
import fs from 'node:fs/promises';
import { expect } from 'chai';

describe('ESM loaders', function() {

	before(function() {
		this.loader = function(specifier) {
			const url = new URL(specifier, import.meta.url).href;
			return code => {
				let dir = path.dirname(fileURLToPath(import.meta.url));
				let file = path.join(dir, './run.js');
				let arg = Buffer.from(code).toString('base64');
				let child = cp.fork(file, [arg], {
					cwd: process.cwd(),
					execArgv: [
						`--experimental-loader=${url}`,
					],
				});
				return new Promise((resolve, reject) => {
					child.on('message', data => resolve(data));
				});
			};
		};
	});

	it('an http loader', async function() {

		// Setup an http server first.
		const server = new http.Server((req, res) => {
			res.end(`export default import.meta.url;`);
		});
		await new Promise(resolve => server.listen(resolve));
		const { port } = server.address();
		const url = `http://127.0.0.1:${port}`;

		const run = this.loader('./loaders/http.js');
		let result = await run(`
		import url from ${JSON.stringify(url)};
		export default url.repeat(2);
		`);

		expect(result).to.equal(url.repeat(2));
		await new Promise(resolve => server.close(resolve));

	});

	it('a transpiler loader', async function() {

		const run = this.loader('./loaders/transpiler.js');		
		let result = await run(`
		import fn from './files/fn.ts';
		export default fn('I like TypeScript');
		`);
		expect(result).to.equal('I don\'t like TypeScript');

	});

});
