// # test.js
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import cp from 'node:child_process';
import fs from 'node:fs/promises';
import semver from 'semver';
import { expect } from 'chai';

describe('ESM loaders', function() {

	this.slow(3000);

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
						'--no-warnings',
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
		const foo = 'bar';
		const server = new http.Server((req, res) => {
			res.end(`export default ${JSON.stringify(foo)};`);
		});
		await new Promise(resolve => server.listen(resolve));
		const { port } = server.address();
		const url = `http://127.0.0.1:${port}/foo`;

		const run = this.loader('./loaders/http.js');
		let result = await run(`
		import str from ${JSON.stringify(url)};
		export default str.repeat(2);
		`);

		expect(result).to.equal(foo.repeat(2));
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

	it('a composite loader', async function() {

		const server = new http.Server((req, res) => {
			res.end(`
			export default function(input: string): string {
				return 'JavaScript';
			}`);
		});
		await new Promise(resolve => server.listen(resolve));
		const url = `http://127.0.0.1:${server.address().port}/fn.ts`;

		const run = this.loader('./loaders/composite.js');
		let result = await run(`
		import fn from ${JSON.stringify(url)};
		export default fn('TypScript');
		`)
		expect(result).to.equal('JavaScript');

		await new Promise(resolve => server.close(resolve));

	});

	it('a loader that accepts certain extensions as options', async function() {

		const run = this.loader('./loaders/extensions.js');
		let result = await run(`
		import foo from './files/foo.es';
		export default foo;
		`);
		expect(result).to.equal('bar');

	});

	it('chains transform hooks', async function() {

		const run = this.loader('./loaders/chained.js');
		let result = await run(`
		export { default } from './files/string.txt';
		`);
		expect(result).to.equal('foofoo');

	});

	it('a dynamically imported loader with sub-dependency', async function() {

		const run = this.loader('./loaders/dynamic.js');
		let result = await run(`
		import './files/foo.js';
		`);

	});

	it('asset/source', async function() {

		const run = this.loader('./loaders/asset-source.js');
		let text = await run(`export { default } from './files/string.txt';`);
		expect(text).to.equal('foo');

	});

	it('asset/inline .png', async function() {

		const run = this.loader('./loaders/asset-inline.js');
		let url = await run(`export { default } from './files/transparent.png';`);
		expect(url).to.equal('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==');

	});

	it('asset/inline .jpg', async function() {

		const run = this.loader('./loaders/asset-inline.js');
		let url = await run(`export { default } from './files/px.jpg';`);
		expect(url).to.match(/^data:image\/jpeg;base64,/);

	});

	it('asset/resource', async function() {
		const run = this.loader('./loaders/asset-resource.js');
		let url = await run(`export { default } from './files/transparent.png';`);
		expect(url).to.equal(new URL('./files/transparent.png', import.meta.url).href);
	});

	context('>=16.12', function() {

		if (!semver.satisfies(process.version, '>=16.12')) return;

		it('a loader where the format is included in resolve', async function() {

			const run = this.loader('./loaders/alias.js');
			let result = await run(`export { default } from './files/string.txt';`);
			expect(result).to.equal('foo');

		});

	});

});
